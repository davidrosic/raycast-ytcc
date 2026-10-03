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

  const traces = [
    {
      phase: 0.3,
      speed: 0.67,
      frequency: 0.85,
      amplitude: 0.88,
      color: [1, 0.22, 0.5],
    },
    {
      phase: 1.65,
      speed: -0.84,
      frequency: 0.96,
      amplitude: 0.94,
      color: [0.72, 0.3, 1],
    },
    {
      phase: 3.1,
      speed: 1,
      frequency: 1.08,
      amplitude: 1,
      color: [0.3, 0.65, 1],
    },
    {
      phase: 4.55,
      speed: 0.79,
      frequency: 0.94,
      amplitude: 0.9,
      color: [0.12, 0.9, 0.95],
    },
    {
      phase: 5.75,
      speed: -1.12,
      frequency: 1.17,
      amplitude: 0.82,
      color: [0.25, 0.95, 0.6],
    },
  ];
  const traceCount = traces.length;
  const middle = (traceCount - 1) / 2;
  const traceOrder = [];
  for (let index = 0; index < traceCount; index += 1) traceOrder.push(index);
  traceOrder.sort(
    (left, right) => Math.abs(right - middle) - Math.abs(left - middle),
  );
  const pointCount = 64;
  let lastFrame = Date.now();
  let elapsed = 0;
  let visualizerLevel = 0;
  let visualizerProcessing = false;
  let fadeStarted;

  function randomBetween(minimum, maximum) {
    return minimum + Math.random() * (maximum - minimum);
  }

  function motion(minimum, maximum, shortest, longest) {
    return {
      minimum,
      maximum,
      shortest,
      longest,
      from: randomBetween(minimum, maximum),
      to: randomBetween(minimum, maximum),
      started: 0,
      duration: randomBetween(shortest, longest),
    };
  }

  function motionValue(state) {
    while (elapsed >= state.started + state.duration) {
      state.from = state.to;
      state.started += state.duration;
      state.to = randomBetween(state.minimum, state.maximum);
      state.duration = randomBetween(state.shortest, state.longest);
    }
    const progress = Math.min(1, (elapsed - state.started) / state.duration);
    const blend =
      progress * progress * progress * (progress * (progress * 6 - 15) + 10);
    return state.from + (state.to - state.from) * blend;
  }

  for (const [index, trace] of traces.entries()) {
    trace.offset = trace.phase;
    trace.height = motion(0.45, 1.05, 750, 2400);
    trace.thickness = motion(0.35, 1.8, 600, 2100);
    trace.tempo = motion(0.7, 1.3, 1400, 3400);
    trace.energy = 0;
    trace.processing = 0;
    trace.attack = 55 + index * 13 + randomBetween(0, 15);
    trace.release = 195 + index * 67.5 + randomBetween(0, 30);
  }

  ObjC.registerSubclass({
    name: "RaycastDictationWaveformView",
    superclass: "NSView",
    methods: {
      "drawRect:": function () {
        const now = Date.now();
        const delta = Math.max(0, Math.min(100, now - lastFrame));
        lastFrame = now;
        elapsed += delta;
        const targetEnergy = Math.pow(visualizerLevel, 0.58);
        if (fadeStarted !== undefined) {
          const fade = Math.min(1, (now - fadeStarted) / 240);
          panel.setAlphaValue(1 - fade * fade * (3 - 2 * fade));
        }
        for (const index of traceOrder) {
          const trace = traces[index];
          const response =
            targetEnergy > trace.energy ? trace.attack : trace.release;
          trace.energy +=
            (targetEnergy - trace.energy) * (1 - Math.exp(-delta / response));
          trace.processing +=
            ((visualizerProcessing ? 1 : 0) - trace.processing) *
            (1 - Math.exp(-delta / 160));
          trace.phase += (delta / 260) * trace.speed * motionValue(trace.tempo);
          const energy = trace.energy;
          const phase = trace.phase;
          const depth = (index - middle) / middle;
          const mix = index / (traceCount - 1);
          const red =
            trace.color[0] +
            (0.66 + mix * 0.1 - trace.color[0]) * trace.processing;
          const green =
            trace.color[1] +
            (0.18 + mix * 0.1 - trace.color[1]) * trace.processing;
          const blue = trace.color[2] + (1 - trace.color[2]) * trace.processing;
          const thickness = motionValue(trace.thickness);
          const baseAlpha = 0.25 + energy * 0.2 + thickness * 0.12;
          const amplitude =
            (1.3 + energy * 18) * trace.amplitude * motionValue(trace.height);
          const positions = [];
          for (let point = 0; point < pointCount; point += 1) {
            const progress = point / (pointCount - 1);
            const envelope = Math.pow(Math.sin(Math.PI * progress), 0.82);
            const primary = Math.sin(
              progress * Math.PI * 5.2 * trace.frequency + phase,
            );
            const detail = Math.sin(
              progress * Math.PI * (8.6 + mix * 2.4) -
                phase * 0.62 +
                trace.offset * 1.7,
            );
            const drift = Math.sin(
              progress * Math.PI * 3.1 - phase * 0.34 + trace.offset,
            );
            const wave = primary * 0.73 + detail * 0.27 + drift * 0.16;
            const yPosition =
              height / 2 +
              envelope * (amplitude * wave + depth * (1 + energy * 2.5));
            positions.push({
              progress,
              y: yPosition,
            });
          }

          const centerWidth = 1.4 * thickness;
          const upper = [];
          const lower = [];
          for (let point = 0; point < pointCount; point += 1) {
            const current = positions[point];
            const previous = positions[Math.max(0, point - 1)];
            const next = positions[Math.min(pointCount - 1, point + 1)];
            const xPosition = 3 + current.progress * (width - 6);
            const deltaX = (next.progress - previous.progress) * (width - 6);
            const deltaY = next.y - previous.y;
            const length = Math.max(
              0.001,
              Math.sqrt(deltaX * deltaX + deltaY * deltaY),
            );
            const falloff = Math.pow(Math.sin(Math.PI * current.progress), 1.7);
            const halfWidth = (centerWidth * falloff) / 2;
            upper.push(
              $.NSMakePoint(
                xPosition - (deltaY / length) * halfWidth,
                current.y + (deltaX / length) * halfWidth,
              ),
            );
            lower.push(
              $.NSMakePoint(
                xPosition + (deltaY / length) * halfWidth,
                current.y - (deltaX / length) * halfWidth,
              ),
            );
          }
          const ribbon = $.NSBezierPath.bezierPath;
          ribbon.moveToPoint(upper[0]);
          for (let point = 1; point < pointCount; point += 1)
            ribbon.lineToPoint(upper[point]);
          for (let point = pointCount - 1; point >= 0; point -= 1)
            ribbon.lineToPoint(lower[point]);
          ribbon.closePath;

          $.NSGraphicsContext.saveGraphicsState;
          const shadow = $.NSShadow.alloc.init;
          shadow.setShadowColor(
            $.NSColor.colorWithCalibratedRedGreenBlueAlpha(
              red,
              green,
              blue,
              0.55,
            ),
          );
          shadow.setShadowBlurRadius(3 + thickness);
          shadow.setShadowOffset($.NSMakeSize(0, 0));
          shadow.set;
          $.NSColor.colorWithCalibratedRedGreenBlueAlpha(red, green, blue, 0.14)
            .setFill;
          ribbon.fill;
          $.NSGraphicsContext.restoreGraphicsState;

          const gradientColors = $.NSMutableArray.alloc.init;
          const alphas = [
            0,
            baseAlpha * 0.7,
            Math.min(1, baseAlpha + 0.26),
            baseAlpha * 0.7,
            0,
          ];
          for (const alpha of alphas)
            gradientColors.addObject(
              $.NSColor.colorWithCalibratedRedGreenBlueAlpha(
                red,
                green,
                blue,
                alpha,
              ),
            );
          const gradient = $.NSGradient.alloc.initWithColors(gradientColors);
          gradient.drawInBezierPathAngle(ribbon, 0);
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
    let nextLevel;
    for (const line of lines) {
      if (line === "stop") {
        stopped = true;
        break;
      }
      if (line === "processing") {
        visualizerProcessing = true;
        nextLevel = 0.4;
        continue;
      }
      if (line === "fade") {
        fadeStarted = Date.now();
        nextLevel = 0;
        continue;
      }
      nextLevel = Number(line);
    }
    if (!stopped && nextLevel !== undefined) draw(nextLevel);
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
  let force: ReturnType<typeof setTimeout> | undefined;
  let closing: Promise<void> | undefined;
  let currentLevel = 0;
  let lastLevel = Date.now();
  let processing = false;
  let fading = false;
  const finished = new Promise<void>((resolve) => {
    child.once("error", () => {
      closed = true;
      if (animation) clearInterval(animation);
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
    if (closed || fading || processing) return;
    currentLevel = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    lastLevel = Date.now();
  };
  const tick = () => {
    if (closed || !child.stdin.writable || child.stdin.writableNeedDrain)
      return;
    const value = fading
      ? 0
      : processing
        ? 0.4
        : Date.now() - lastLevel > 180
          ? 0
          : currentLevel;
    child.stdin.write(`${value}\n`);
  };
  const animation = setInterval(tick, 40);
  tick();

  return {
    ready,
    level,
    processing() {
      if (closed || fading || processing) return;
      processing = true;
      if (child.stdin.writable) child.stdin.write("processing\n");
    },
    close() {
      if (closing) return closing;
      if (closed) return finished;
      fading = true;
      closing = (async () => {
        if (child.stdin.writable) child.stdin.write("fade\n");
        let fadeTimer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([
          finished,
          new Promise<void>((resolve) => {
            fadeTimer = setTimeout(resolve, 280);
          }),
        ]);
        if (fadeTimer) clearTimeout(fadeTimer);
        if (animation) clearInterval(animation);
        if (!closed) {
          if (child.stdin.writable) child.stdin.end("stop\n");
          force = setTimeout(() => child.kill("SIGTERM"), 1_000);
        }
        await finished;
      })();
      return closing;
    },
  };
}
