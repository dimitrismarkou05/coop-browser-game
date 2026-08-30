export type DevConsoleHandlers = {
  onSubmit: (line: string) => void;
  onOpenChange: (open: boolean) => void;
};

export class DevConsole {
  private readonly root: HTMLDivElement;
  private readonly logEl: HTMLDivElement;
  private readonly input: HTMLInputElement;
  private open = false;

  constructor(private readonly handlers: DevConsoleHandlers) {
    this.root = document.createElement("div");
    this.root.id = "dev-console";
    this.root.innerHTML = `
      <div class="dev-log"></div>
      <div class="dev-row">
        <span class="dev-prompt">&gt;</span>
        <input class="dev-input" type="text" spellcheck="false" autocomplete="off" />
      </div>
      <div class="dev-hint">\` toggle · spawn zombie · kill player &lt;name&gt; · kill players · kill zombies &lt;n&gt; · kill all zombies · help</div>
    `;
    document.body.appendChild(this.root);
    this.logEl = this.root.querySelector(".dev-log")!;
    this.input = this.root.querySelector(".dev-input")!;

    this.input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.code === "Enter") {
        const line = this.input.value.trim();
        if (line) {
          this.append(`> ${line}`, "cmd");
          this.handlers.onSubmit(line);
          this.input.value = "";
        }
      }
      if (e.code === "Escape") {
        this.setOpen(false);
      }
    });

    window.addEventListener("keydown", this.onToggle);
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onToggle);
    this.root.remove();
  }

  isOpen(): boolean {
    return this.open;
  }

  append(text: string, kind: "cmd" | "ok" | "err" | "info" = "info"): void {
    const line = document.createElement("div");
    line.className = `dev-line ${kind}`;
    line.textContent = text;
    this.logEl.appendChild(line);
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  private setOpen(open: boolean): void {
    this.open = open;
    this.root.classList.toggle("open", open);
    this.handlers.onOpenChange(open);
    if (open) {
      if (document.pointerLockElement) document.exitPointerLock();
      this.input.focus();
    } else {
      this.input.blur();
    }
  }

  private readonly onToggle = (e: KeyboardEvent) => {
    if (e.code !== "Backquote") return;
    // Allow toggle even when typing, but if open and typing in input, only toggle on bare `
    e.preventDefault();
    this.setOpen(!this.open);
  };
}
