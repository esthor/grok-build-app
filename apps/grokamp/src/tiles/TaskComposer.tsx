import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import {
  applyCompletion,
  EFFORT_TIERS,
  GROUP_LABEL,
  KNOWN_REPOS,
  matchCommands,
  slashFragment,
  type SlashCommand,
} from "../agent/commands";
import { queueTask, type TaskDraft } from "../agent/controller";
import { LcdText, SquareBtn } from "../ui/controls";

/**
 * The real ADD: pick a repo, write the prompt, and get grok-build's actual
 * /slash commands as you type (session, model, memory, extensions, workflow,
 * agents, skills…). Ctrl/Cmd+Enter queues.
 */
export function TaskComposer({ onClose }: { readonly onClose: () => void }): ReactNode {
  const [repo, setRepo] = useState<string>(KNOWN_REPOS[0] ?? "grok-build-app");
  const [customRepo, setCustomRepo] = useState("");
  const [effort, setEffort] = useState("medium");
  const [prompt, setPrompt] = useState("");
  const [caret, setCaret] = useState(0);
  const [pick, setPick] = useState(0);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    areaRef.current?.focus();
  }, []);

  const fragment = slashFragment(prompt, caret);
  const matches = fragment === null ? [] : matchCommands(fragment);
  const active = matches[Math.min(pick, Math.max(0, matches.length - 1))];

  const complete = (command: SlashCommand): void => {
    const next = applyCompletion(prompt, caret, command);
    setPrompt(next.text);
    setCaret(next.caret);
    setPick(0);
    requestAnimationFrame(() => {
      const area = areaRef.current;
      if (area !== null) {
        area.focus();
        area.setSelectionRange(next.caret, next.caret);
      }
    });
  };

  const effectiveRepo = repo === "custom" ? customRepo.trim() : repo;
  const canQueue = prompt.trim().length > 0 && effectiveRepo.length > 0;

  const submit = (): void => {
    if (!canQueue) {
      return;
    }
    const draft: TaskDraft = { repo: effectiveRepo, prompt, effort };
    queueTask(draft);
    onClose();
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
    if (matches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setPick((p) => (p + 1) % matches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setPick((p) => (p - 1 + matches.length) % matches.length);
        return;
      }
      if ((e.key === "Tab" || e.key === "Enter") && active !== undefined) {
        e.preventDefault();
        complete(active);
        return;
      }
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="about-backdrop" onClick={onClose} role="presentation">
      <div
        className="composer bevel-out"
        onClick={(e) => {
          e.stopPropagation();
        }}
        role="dialog"
        aria-label="queue a task"
      >
        <div className="about-title">QUEUE A TASK</div>

        <div className="composer-row">
          <span className="mini-label">REPO</span>
          <select
            className="tuner-preset"
            value={repo}
            title="which repo the agent works in"
            onChange={(e) => {
              setRepo(e.target.value);
            }}
          >
            {KNOWN_REPOS.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            <option value="custom">other…</option>
          </select>
          {repo === "custom" && (
            <input
              className="skinlab-name"
              value={customRepo}
              placeholder="owner/repo or path"
              onChange={(e) => {
                setCustomRepo(e.target.value);
              }}
            />
          )}
          <span className="mini-label">EFFORT</span>
          <select
            className="tuner-preset"
            value={effort}
            title="reasoning effort (/effort)"
            onChange={(e) => {
              setEffort(e.target.value);
            }}
          >
            {EFFORT_TIERS.map((tier) => (
              <option key={tier} value={tier}>
                {tier}
              </option>
            ))}
          </select>
        </div>

        <div className="composer-area lcd">
          <textarea
            ref={areaRef}
            className="composer-input"
            value={prompt}
            placeholder="what should the agent do?  type / for commands…"
            spellCheck={false}
            onChange={(e) => {
              setPrompt(e.target.value);
              setCaret(e.target.selectionStart);
              setPick(0);
            }}
            onKeyUp={(e) => {
              setCaret(e.currentTarget.selectionStart);
            }}
            onClick={(e) => {
              setCaret(e.currentTarget.selectionStart);
            }}
            onKeyDown={onKeyDown}
          />
          {matches.length > 0 && (
            <ul className="composer-complete" role="listbox" aria-label="slash commands">
              {matches.map((command, index) => (
                <li
                  key={command.name}
                  role="option"
                  aria-selected={command === active}
                  data-active={command === active ? "yes" : "no"}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    complete(command);
                  }}
                  onMouseEnter={() => {
                    setPick(index);
                  }}
                >
                  <span className="composer-cmd">/{command.name}</span>
                  {command.argHint !== undefined && (
                    <span className="composer-arg">{command.argHint}</span>
                  )}
                  <span className="composer-hint">{command.hint}</span>
                  <span className="composer-group">{GROUP_LABEL[command.group]}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="composer-foot">
          <LcdText dim>
            {matches.length > 0
              ? "↑/↓ choose · TAB completes · ⌘/CTRL+ENTER queues"
              : "⌘/CTRL+ENTER queues · ESC cancels · a queued task runs once, never twice"}
          </LcdText>
          <span className="composer-actions">
            <SquareBtn title="cancel" onClick={onClose}>
              CANCEL
            </SquareBtn>
            <SquareBtn title="add to the queue" onClick={submit} disabled={!canQueue} lit={canQueue}>
              QUEUE IT
            </SquareBtn>
          </span>
        </div>
      </div>
    </div>
  );
}
