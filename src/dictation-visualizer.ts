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

  const width = 280;
  const height = 92;
  const visible = screen.visibleFrame;
  const x = Number(visible.origin.x) + (Number(visible.size.width) - width) / 2;
  const y = Number(visible.origin.y) + 48;
  const panel = $.NSPanel.alloc.initWithContentRectStyleMaskBackingDefer(
    $.NSMakeRect(x, y, width, height),
    $.NSWindowStyleMaskBorderless,
    $.NSBackingStoreBuffered,
    false,
  );
  panel.setOpaque(false);
  panel.setBackgroundColor($.NSColor.clearColor);
  panel.setHasShadow(false);
  panel.setHidesOnDeactivate(false);
  panel.setIgnoresMouseEvents(true);
  panel.setLevel($.NSStatusWindowLevel);
  panel.setCollectionBehavior(
    Number($.NSWindowCollectionBehaviorCanJoinAllSpaces) |
      Number($.NSWindowCollectionBehaviorFullScreenAuxiliary),
  );

  const traceCount = 15;
  const middle = (traceCount - 1) / 2;
  const traceOrder = [];
  for (let index = 0; index < traceCount; index += 1) traceOrder.push(index);
  traceOrder.sort(
    (left, right) =>
      Math.abs(right - middle) - Math.abs(left - middle),
  );
  let visualizerLevel = 0;

  ObjC.registerSubclass({
    name: "RaycastDictationWaveformView",
    superclass: "NSView",
    methods: {
      "drawRect:": function () {
        const energy = Math.pow(visualizerLevel, 0.58);
        const phase = Date.now() / 175;
        const pointCount = 96;
        for (const index of traceOrder) {
          const distance = Math.abs(index - middle) / middle;
          const depth = (index - middle) / middle;
          const mix = index / (traceCount - 1);
          const red = 0.36 - mix * 0.12;
          const green = 0.3 + mix * 0.55;
          const blue = 1;
          const color = $.NSColor.colorWithCalibratedRedGreenBlueAlpha(
            red,
            green,
            blue,
            0.14 + (1 - distance) * 0.38,
          );
          const path = $.NSBezierPath.bezierPath;
          path.setLineWidth(index === middle ? 1.35 : 0.58);
          for (let point = 0; point < pointCount; point += 1) {
            const progress = point / (pointCount - 1);
            const envelope = Math.pow(Math.sin(Math.PI * progress), 0.82);
            const primary = Math.sin(
              progress * Math.PI * 5.2 + phase + depth * 0.48,
            );
            const detail = Math.sin(
              progress * Math.PI * 10.4 - phase * 0.62 + depth * 1.1,
            );
            const drift = Math.sin(progress * Math.PI * 3.1 - phase * 0.34);
            const amplitude = 2.2 + energy * 24;
            const wave =
              primary * 0.73 + detail * 0.27 + depth * drift * 0.28;
            const position = $.NSMakePoint(
              4 + progress * (width - 8),
              height / 2 +
                envelope *
                  (amplitude * wave + depth * (3.5 + energy * 11.5)),
            );
            if (point === 0) path.moveToPoint(position);
            else path.lineToPoint(position);
          }

          $.NSGraphicsContext.saveGraphicsState;
          if (Math.abs(index - middle) <= 1) {
            const shadow = $.NSShadow.alloc.init;
            shadow.setShadowColor(
              $.NSColor.colorWithCalibratedRedGreenBlueAlpha(
                red,
                green,
                blue,
                index === middle ? 0.9 : 0.25,
              ),
            );
            shadow.setShadowBlurRadius(index === middle ? 7 : 2.5);
            shadow.setShadowOffset($.NSMakeSize(0, 0));
            shadow.set;
          }
          color.setStroke;
          path.stroke;
          $.NSGraphicsContext.restoreGraphicsState;
        }
      },
    },
  });

  const canvas = $.RaycastDictationWaveformView.alloc.initWithFrame(
    $.NSMakeRect(0, 0, width, height),
  );
  canvas.setWantsLayer(true);
  canvas.layer.setBackgroundColor(
    $.NSColor.colorWithCalibratedRedGreenBlueAlpha(0, 0, 0, 0.001).CGColor,
  );
  panel.setContentView(canvas);

  function draw(level) {
    const value = Math.max(0, Math.min(1, Number(level) || 0));
    visualizerLevel = value;
    canvas.setNeedsDisplay(true);
    canvas.display;
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
    } else if (!chunk.includes("raycast-visualizer-ready")) {
      console.error(chunk.trim());
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
