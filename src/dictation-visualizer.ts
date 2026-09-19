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

  const width = 160;
  const height = 70;
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
  panel.setHasShadow(false);
  panel.setHidesOnDeactivate(false);
  panel.setIgnoresMouseEvents(true);
  panel.setLevel($.NSStatusWindowLevel);
  panel.setCollectionBehavior(
    Number($.NSWindowCollectionBehaviorCanJoinAllSpaces) |
      Number($.NSWindowCollectionBehaviorFullScreenAuxiliary),
  );

  const traceCount = 5;
  const middle = (traceCount - 1) / 2;
  const traceOrder = [];
  for (let index = 0; index < traceCount; index += 1) traceOrder.push(index);
  traceOrder.sort(
    (left, right) =>
      Math.abs(right - middle) - Math.abs(left - middle),
  );
  const pointCount = 64;
  const falloffBandSize = 3;
  let visualizerLevel = 0;
  let visualizerProcessing = false;

  ObjC.registerSubclass({
    name: "RaycastDictationWaveformView",
    superclass: "NSView",
    methods: {
      "drawRect:": function () {
        const energy = Math.pow(visualizerLevel, 0.58);
        const phase = Date.now() / 175;
        for (const index of traceOrder) {
          const distance = Math.abs(index - middle) / middle;
          const depth = (index - middle) / middle;
          const mix = index / (traceCount - 1);
          const red = visualizerProcessing
            ? 0.66 + mix * 0.1
            : 0.36 - mix * 0.12;
          const green = visualizerProcessing
            ? 0.18 + mix * 0.1
            : 0.3 + mix * 0.55;
          const blue = 1;
          const baseAlpha = 0.18 + (1 - distance) * 0.42;
          const amplitude = 1.5 + energy * 16;
          const positions = [];
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
            const wave =
              primary * 0.73 + detail * 0.27 + depth * drift * 0.28;
            const yPosition =
              height / 2 +
              envelope * (amplitude * wave + depth * (2 + energy * 7.5));
            positions.push({
              point: $.NSMakePoint(3 + progress * (width - 6), yPosition),
              progress,
              y: yPosition,
            });
          }

          for (
            let from = 0;
            from < pointCount - 1;
            from += falloffBandSize
          ) {
            const to = Math.min(pointCount - 1, from + falloffBandSize);
            const progress = (from + to) / 2 / (pointCount - 1);
            const curve = Math.sin(Math.PI * progress);
            const falloff = 0.055 + 0.945 * curve * curve;
            let peak = 0;
            for (let point = from; point <= to; point += 1)
              peak = Math.max(
                peak,
                Math.abs(positions[point].y - height / 2) / (amplitude + 8),
              );
            const peakBoost = Math.max(
              0,
              Math.min(1, (peak - 0.25) / 0.55),
            );
            const path = $.NSBezierPath.bezierPath;
            const edgeWidth = index === middle ? 0.36 : 0.2;
            const centerWidth = index === middle ? 1.45 : 0.62;
            path.setLineWidth(
              edgeWidth +
                (centerWidth - edgeWidth) * falloff +
                (index === middle ? 0.24 : 0.1) * peakBoost * falloff,
            );
            path.setLineCapStyle($.NSRoundLineCapStyle);
            for (let point = from; point <= to; point += 1) {
              if (point === from) path.moveToPoint(positions[point].point);
              else path.lineToPoint(positions[point].point);
            }

            $.NSGraphicsContext.saveGraphicsState;
            if (Math.abs(index - middle) <= 1) {
              const shadow = $.NSShadow.alloc.init;
              shadow.setShadowColor(
                $.NSColor.colorWithCalibratedRedGreenBlueAlpha(
                  red,
                  green,
                  blue,
                  (index === middle ? 0.95 : 0.32) *
                    falloff *
                    (0.5 + 0.5 * peakBoost),
                ),
              );
              shadow.setShadowBlurRadius(
                (index === middle
                  ? 3 + 5 * falloff
                  : 1.5 + 2 * falloff) *
                  (0.8 + 0.2 * peakBoost),
              );
              shadow.setShadowOffset($.NSMakeSize(0, 0));
              shadow.set;
            }
            const highlight =
              Math.abs(index - middle) <= 1
                ? (index === middle ? 0.32 : 0.1) *
                  falloff *
                  (0.45 + 0.55 * peakBoost)
                : 0;
            $.NSColor.colorWithCalibratedRedGreenBlueAlpha(
              red,
              green,
              blue,
              Math.min(1, baseAlpha * falloff + highlight),
            ).setStroke;
            path.stroke;
            $.NSGraphicsContext.restoreGraphicsState;
          }
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
      if (line === "processing") {
        visualizerProcessing = true;
        draw(0.4);
        continue;
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
      if (!closed && child.stdin.writable) child.stdin.write("processing\n");
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
