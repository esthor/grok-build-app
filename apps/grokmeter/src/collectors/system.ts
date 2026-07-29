// Live macOS system stats via stock CLI tools — the Rainmeter "measures".
// Each sampler is independent and failure-tolerant; the deck merges whatever
// is fresh. Per-core CPU needs privileged APIs on macOS, so live mode
// reports cores: [] and the CPU widget falls back to a total-load bar.

import { hostname } from "node:os";
import type { SysStats } from "../shared/protocol.ts";

type Emit = { sys: (sys: SysStats) => void };

async function run(cmd: string[]): Promise<string> {
  try {
    const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "ignore" });
    const out = await proc.stdout.text();
    await proc.exited;
    return out;
  } catch {
    return "";
  }
}

export function startSystem(emit: Emit): void {
  const state = {
    hostname: hostname(),
    os: "macOS",
    bootSec: 0,
    cpuTotal: 0,
    load: [0, 0, 0] as [number, number, number],
    memUsed: 0,
    memTotal: 0,
    memWired: 0,
    memCompressed: 0,
    iface: "en0",
    rxTotal: 0,
    txTotal: 0,
    rxBps: 0,
    txBps: 0,
    netAt: 0,
    diskUsed: 0,
    diskTotal: 0,
    procs: [] as SysStats["procs"],
  };

  // ── One-time identity ──────────────────────────────────────────────────
  void (async () => {
    const ver = (await run(["sw_vers", "-productVersion"])).trim();
    if (ver !== "") state.os = `macOS ${ver}`;
    const boot = await run(["sysctl", "-n", "kern.boottime"]);
    const m = /sec = (\d+)/.exec(boot);
    if (m?.[1] !== undefined) state.bootSec = Number(m[1]);
    const route = await run(["route", "-n", "get", "default"]);
    const im = /interface: (\S+)/.exec(route);
    if (im?.[1] !== undefined) state.iface = im[1];
  })();

  // ── CPU: `top` needs a 1s window for an instantaneous reading, so the
  //    sampler self-schedules instead of using an interval. ──────────────
  const sampleCpu = async (): Promise<void> => {
    const out = await run(["top", "-l", "2", "-n", "0", "-s", "1"]);
    const lines = out.split("\n").filter((l) => l.startsWith("CPU usage"));
    const last = lines[lines.length - 1];
    if (last !== undefined) {
      const m = /([\d.]+)% idle/.exec(last);
      if (m?.[1] !== undefined) state.cpuTotal = Math.max(0, 100 - Number(m[1]));
    }
    const la = await run(["sysctl", "-n", "vm.loadavg"]);
    const lm = /([\d.]+) ([\d.]+) ([\d.]+)/.exec(la);
    if (lm !== null && lm[1] !== undefined && lm[2] !== undefined && lm[3] !== undefined) {
      state.load = [Number(lm[1]), Number(lm[2]), Number(lm[3])];
    }
    setTimeout(() => void sampleCpu(), 400);
  };
  void sampleCpu();

  // ── Memory every 2s ────────────────────────────────────────────────────
  const sampleMem = async (): Promise<void> => {
    const [vmOut, totalOut] = await Promise.all([
      run(["vm_stat"]),
      state.memTotal === 0 ? run(["sysctl", "-n", "hw.memsize"]) : Promise.resolve(""),
    ]);
    if (totalOut.trim() !== "") state.memTotal = Number(totalOut.trim());
    const page = (label: string): number => {
      const m = new RegExp(`${label}:\\s+(\\d+)`).exec(vmOut);
      return m?.[1] !== undefined ? Number(m[1]) : 0;
    };
    const pageSizeM = /page size of (\d+) bytes/.exec(vmOut);
    const pageSize = pageSizeM?.[1] !== undefined ? Number(pageSizeM[1]) : 16384;
    const active = page("Pages active");
    const wired = page("Pages wired down");
    const compressed = page("Pages occupied by compressor");
    const speculative = page("Pages speculative");
    state.memUsed = (active + wired + compressed + speculative) * pageSize;
    state.memWired = wired * pageSize;
    state.memCompressed = compressed * pageSize;
  };
  void sampleMem();
  setInterval(() => void sampleMem(), 2000);

  // ── Network every 1s (delta of interface byte counters) ───────────────
  const sampleNet = async (): Promise<void> => {
    const out = await run(["netstat", "-ibn", "-I", state.iface]);
    const line = out.split("\n").find((l) => l.includes("<Link#"));
    if (line === undefined) return;
    const cols = line.trim().split(/\s+/);
    // Name Mtu Network Address Ipkts Ierrs Ibytes Opkts Oerrs Obytes
    const rx = Number(cols[6] ?? "0");
    const tx = Number(cols[9] ?? "0");
    const now = Date.now();
    if (state.netAt > 0 && rx >= state.rxTotal && tx >= state.txTotal) {
      const dt = (now - state.netAt) / 1000;
      if (dt > 0.2) {
        state.rxBps = (rx - state.rxTotal) / dt;
        state.txBps = (tx - state.txTotal) / dt;
      }
    }
    state.rxTotal = rx;
    state.txTotal = tx;
    state.netAt = now;
  };
  void sampleNet();
  setInterval(() => void sampleNet(), 1000);

  // ── Disk every 30s ─────────────────────────────────────────────────────
  const sampleDisk = async (): Promise<void> => {
    // On macOS "/" is the sealed system volume; user data lives on the Data
    // volume. Try that first, fall back to root.
    for (const vol of ["/System/Volumes/Data", "/"]) {
      const out = await run(["df", "-k", vol]);
      const line = out.split("\n")[1];
      if (line === undefined) continue;
      const cols = line.trim().split(/\s+/);
      const totalK = Number(cols[1] ?? "0");
      const usedK = Number(cols[2] ?? "0");
      if (totalK > 0) {
        state.diskTotal = totalK * 1024;
        state.diskUsed = usedK * 1024;
        return;
      }
    }
  };
  void sampleDisk();
  setInterval(() => void sampleDisk(), 30_000);

  // ── Processes every 2s ─────────────────────────────────────────────────
  const sampleProcs = async (): Promise<void> => {
    const out = await run(["ps", "-Aceo", "pid,pcpu,pmem,comm", "-r"]);
    const rows = out.split("\n").slice(1, 9);
    const procs: SysStats["procs"] = [];
    for (const row of rows) {
      const m = /^\s*(\d+)\s+([\d.]+)\s+([\d.]+)\s+(.+)$/.exec(row);
      if (m === null) continue;
      const [, pid, cpu, mem, name] = m;
      if (pid === undefined || cpu === undefined || mem === undefined || name === undefined) continue;
      procs.push({
        pid: Number(pid),
        cpuPct: Number(cpu),
        memPct: Number(mem),
        name: name.trim(),
      });
    }
    if (procs.length > 0) state.procs = procs.slice(0, 6);
  };
  void sampleProcs();
  setInterval(() => void sampleProcs(), 2000);

  // ── Broadcast merged snapshot at 1s ────────────────────────────────────
  setInterval(() => {
    emit.sys({
      at: Date.now(),
      hostname: state.hostname,
      os: state.os,
      uptimeSec: state.bootSec > 0 ? Math.floor(Date.now() / 1000) - state.bootSec : 0,
      cpu: {
        totalPct: Math.round(state.cpuTotal * 10) / 10,
        cores: [],
        load1: state.load[0],
        load5: state.load[1],
        load15: state.load[2],
      },
      mem: {
        usedBytes: state.memUsed,
        totalBytes: state.memTotal,
        wiredBytes: state.memWired,
        compressedBytes: state.memCompressed,
      },
      net: {
        iface: state.iface,
        rxBps: Math.max(0, state.rxBps),
        txBps: Math.max(0, state.txBps),
        rxTotal: state.rxTotal,
        txTotal: state.txTotal,
      },
      disk: { path: "/", usedBytes: state.diskUsed, totalBytes: state.diskTotal },
      procs: state.procs,
    });
  }, 1000);
}
