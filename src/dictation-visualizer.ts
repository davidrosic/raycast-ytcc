import { spawn } from "node:child_process";

export type DictationVisualizer = {
  ready: Promise<boolean>;
  level: (value: number) => void;
  processing: () => void;
  close: () => Promise<void>;
};

const visualizerScript = String.raw`
ObjC.import("AppKit");
ObjC.import("Foundation");
ObjC.import("QuartzCore");

function runVisualizer() {
  const app = $.NSApplication.sharedApplication;
  app.setActivationPolicy($.NSApplicationActivationPolicyAccessory);
  const screen = $.NSScreen.mainScreen;
  if (!screen) return;

  const width = 132;
  const height = 46;
  const visible = screen.visibleFrame;
  const x = Number(visible.origin.x) + (Number(visible.size.width) - width) / 2;
  const y = Number(visible.origin.y) + 54;
  const panel = $.NSPanel.alloc.initWithContentRectStyleMaskBackingDefer(
    $.NSMakeRect(x, y, width, height),
    $.NSWindowStyleMaskBorderless,
    $.NSBackingStoreBuffered,
    false,
  );
  panel.setOpaque(false);
  panel.setBackgroundColor($.NSColor.clearColor);
  panel.setHasShadow(true);
  panel.setHidesOnDeactivate(false);
  panel.setIgnoresMouseEvents(true);
  panel.setLevel($.NSStatusWindowLevel);
  panel.setCollectionBehavior(
    Number($.NSWindowCollectionBehaviorCanJoinAllSpaces) |
      Number($.NSWindowCollectionBehaviorFullScreenAuxiliary),
  );

  const bubble = $.NSView.alloc.initWithFrame($.NSMakeRect(0, 0, width, height));
  bubble.setWantsLayer(true);
  bubble.layer.setCornerRadius(18);
  bubble.layer.setBackgroundColor(
    $.NSColor.colorWithCalibratedRedGreenBlueAlpha(0.075, 0.09, 0.14, 0.96).CGColor,
  );
  panel.setContentView(bubble);

  const weights = [0.45, 0.72, 0.92, 1, 0.86, 0.68, 0.42];
  const bars = [];
  const barWidth = 5;
  const gap = 7;
  const firstX = (width - (weights.length * barWidth + (weights.length - 1) * gap)) / 2;
  for (let index = 0; index < weights.length; index += 1) {
    const bar = $.NSView.alloc.initWithFrame(
      $.NSMakeRect(firstX + index * (barWidth + gap), height / 2 - 2, barWidth, 4),
    );
    bar.setWantsLayer(true);
    bar.layer.setCornerRadius(barWidth / 2);
    bar.layer.setBackgroundColor(
      $.NSColor.colorWithCalibratedRedGreenBlueAlpha(0.26, 0.87, 0.73, 1).CGColor,
    );
    bubble.addSubview(bar);
    bars.push(bar);
  }

  function draw(level) {
    const value = Math.max(0, Math.min(1, Number(level) || 0));
    const time = Date.now() / 95;
    for (let index = 0; index < bars.length; index += 1) {
      const movement = 0.84 + 0.16 * Math.sin(time + index * 1.35);
      const barHeight = 4 + value * 27 * weights[index] * movement;
      bars[index].setFrame(
        $.NSMakeRect(
          firstX + index * (barWidth + gap),
          (height - barHeight) / 2,
          barWidth,
          barHeight,
        ),
      );
    }
    bubble.displayIfNeeded;
  }

  panel.orderFrontRegardless;
  draw(0);
  console.log("raycast-visualizer-ready");
  $.NSRunLoop.currentRunLoop.runUntilDate(
    $.NSDate.dateWithTimeIntervalSinceNow(0.02),
  );

  const input = $.NSFileHandle.fileHandleWithStandardInput;
  let pending = "";
  let stopped = false;
  while (!stopped) {
    const data = input.availableData;
    if (Number(data.length) === 0) break;
    pending += ObjC.unwrap(
      $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding),
    );
    const lines = pending.split("\n");
    pending = lines.pop() || "";
    for (const line of lines) {
      if (line === "stop") {
        stopped = true;
        break;
      }
      draw(Number(line));
    }
    $.NSRunLoop.currentRunLoop.runUntilDate(
      $.NSDate.dateWithTimeIntervalSinceNow(0.008),
    );
  }
  panel.orderOut(null);
}

runVisualizer();
`;

/** A small floating waveform that never takes focus from the current app. */
export function startDictationVisualizer(): DictationVisualizer {
  const child = spawn(
    "/usr/bin/osascript",
    ["-l", "JavaScript", "-e", visualizerScript],
    { shell: false, windowsHide: true, stdio: ["pipe", "ignore", "pipe"] },
  );
  let closed = false;
  let readySettled = false;
  let resolveReady: (ready: boolean) => void;
  const ready = new Promise<boolean>((resolve) => {
    resolveReady = resolve;
  });
  let animation: ReturnType<typeof setInterval> | undefined;
  let force: ReturnType<typeof setTimeout> | undefined;
  const finished = new Promise<void>((resolve) => {
    child.once("error", () => {
      closed = true;
      if (!readySettled) {
        readySettled = true;
        resolveReady(false);
      }
      resolve();
    });
    child.once("close", () => {
      closed = true;
      if (!readySettled) {
        readySettled = true;
        resolveReady(false);
      }
      if (animation) clearInterval(animation);
      if (force) clearTimeout(force);
      resolve();
    });
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    if (!readySettled && chunk.includes("raycast-visualizer-ready")) {
      readySettled = true;
      resolveReady(true);
    }
  });
  child.stdin.on("error", () => undefined);
  const level = (value: number) => {
    if (closed || !child.stdin.writable) return;
    child.stdin.write(`${Math.max(0, Math.min(1, value))}\n`);
  };
  level(0);

  return {
    ready,
    level,
    processing() {
      if (animation) clearInterval(animation);
      const started = Date.now();
      animation = setInterval(() => {
        const phase = (Date.now() - started) / 210;
        level(0.25 + 0.2 * (Math.sin(phase) + 1));
      }, 70);
    },
    async close() {
      if (animation) clearInterval(animation);
      if (closed) return;
      if (child.stdin.writable) child.stdin.end("stop\n");
      force = setTimeout(() => child.kill("SIGTERM"), 1_000);
      await finished;
    },
  };
}
