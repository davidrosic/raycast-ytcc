/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Download Folder - Where subtitles, audio and video are saved */
  "downloadDirectory"?: string,
  /** yt-dlp Executable - Optional; otherwise found in PATH or common Homebrew locations */
  "ytDlpPath"?: string,
  /** ffmpeg Executable - Needed for audio conversion, MP4 merging, and Whisper transcription */
  "ffmpegPath"?: string,
  /** whisper.cpp CLI - Path to whisper-cli; auto-detected in ~/GitHub/whisper.cpp when available */
  "whisperPath"?: string,
  /** Large V3 Turbo Model - Path to ggml-large-v3-turbo.bin; auto-detected beside whisper.cpp when available */
  "modelPath"?: string,
  /** Voice Activity Detection - Transcribe only the parts with speech. This stops whisper from inventing text during silence and music, and is faster. */
  "skipSilence": boolean,
  /** Silero VAD Model - Optional; ggml-silero-v6.2.0.bin (885 KB) is downloaded automatically when not set */
  "vadModelPath"?: string,
  /** Transcription Language - Spoken language, for example Serbian or auto */
  "whisperLanguage": string,
  /** Favorite Caption Languages - Comma-separated language names or codes; case and '(orig)' are ignored (for example Serbian, English) */
  "favoriteLanguages": string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `youtube-download` command */
  export type YoutubeDownload = ExtensionPreferences & {}
  /** Preferences accessible in the `transcribe-selected-files` command */
  export type TranscribeSelectedFiles = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `youtube-download` command */
  export type YoutubeDownload = {}
  /** Arguments passed to the `transcribe-selected-files` command */
  export type TranscribeSelectedFiles = {}
}

