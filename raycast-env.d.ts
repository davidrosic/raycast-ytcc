/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Download Folder - Where subtitles, audio, video and YouTube transcriptions are saved */
  "downloadDirectory"?: string,
  /** yt-dlp Executable - Optional; otherwise found in PATH or common Homebrew locations */
  "ytDlpPath"?: string,
  /** ffmpeg Executable - Needed for MP3, M4A and MP4, subtitle conversion, and transcription */
  "ffmpegPath"?: string,
  /** Browser Sign-In - Off by default. Choose the browser you're signed in with to download age-restricted, private and members-only YouTube videos, and posts on Instagram, X and other sites that need an account. yt-dlp reads that browser's cookies on your Mac; they are never sent anywhere else. */
  "browserCookies": "none" | "safari" | "chrome" | "firefox" | "brave" | "edge" | "chromium" | "opera" | "vivaldi",
  /** Browser Tab - When no video link is in your clipboard, Download Video opens the video in the browser tab you were watching. macOS asks once to let Raycast read the tab's address. */
  "browserTab": boolean,
  /** whisper.cpp CLI - Path to whisper-cli; auto-detected in ~/GitHub/whisper.cpp when available */
  "whisperPath"?: string,
  /** Default Whisper Model - Optional; a ggml model such as ggml-large-v3-turbo.bin. When not set, the default chosen in Manage Tools and Models is used. Other models in the same folder can be chosen when transcribing. */
  "modelPath"?: string,
  /** Voice Activity Detection - Transcribe only the parts with speech. This stops whisper from inventing text during silence and music, and is faster. */
  "skipSilence": boolean,
  /** Silero VAD Model - Optional; ggml-silero-v6.2.0.bin (885 KB) is downloaded automatically when not set */
  "vadModelPath"?: string,
  /** Notifications - Show a macOS notification when everything in the queue is done */
  "notifyWhenDone": boolean,
  /** Transcription Language - Spoken language to preselect when no favorite language matches, for example Serbian or auto */
  "whisperLanguage": string,
  /** Favorite Caption Languages - Comma-separated language names or codes; case and '(orig)' are ignored (for example Serbian, English) */
  "favoriteLanguages": string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `download-video` command */
  export type DownloadVideo = ExtensionPreferences & {}
  /** Preferences accessible in the `transcribe-selected-files` command */
  export type TranscribeSelectedFiles = ExtensionPreferences & {}
  /** Preferences accessible in the `transcription-queue` command */
  export type TranscriptionQueue = ExtensionPreferences & {}
  /** Preferences accessible in the `manage-tools-and-models` command */
  export type ManageToolsAndModels = ExtensionPreferences & {}
  /** Preferences accessible in the `queue-menu-bar` command */
  export type QueueMenuBar = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `download-video` command */
  export type DownloadVideo = {}
  /** Arguments passed to the `transcribe-selected-files` command */
  export type TranscribeSelectedFiles = {}
  /** Arguments passed to the `transcription-queue` command */
  export type TranscriptionQueue = {}
  /** Arguments passed to the `manage-tools-and-models` command */
  export type ManageToolsAndModels = {}
  /** Arguments passed to the `queue-menu-bar` command */
  export type QueueMenuBar = {}
}

