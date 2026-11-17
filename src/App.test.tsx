import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("渲染标题与空状态文案", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "日常记录" })).toBeInTheDocument();
    expect(screen.getByText("脚手架已就绪，接下来会在这里写记录。")).toBeInTheDocument();
  });
});
