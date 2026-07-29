import { useStore } from "@tanstack/react-store";
import type { ReactNode } from "react";
import { sessionStore } from "../state/session";
import { LcdText } from "../ui/controls";

export function TodosTile(): ReactNode {
  const todos = useStore(sessionStore, (s) => s.todos);

  return (
    <div className="todos-tile lcd">
      {todos.length === 0 ? (
        <div className="todos-empty">
          <LcdText dim>no plan yet — play a task and the agent will write one</LcdText>
        </div>
      ) : (
        <ul className="todos-list">
          {todos.map((todo) => (
            <li key={todo.id} className="todo-row" data-status={todo.status}>
              <span className="todo-glyph">
                {todo.status === "completed" ? "✓" : todo.status === "in_progress" ? "▶" : "○"}
              </span>
              <span className="todo-text">{todo.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
