# Changelog

## [1.1.0] - 2025-05-05
### Added
- Overwrite Session command to replace saved sessions with currently open files
- Prompt to save unsaved files before switching sessions or overwriting

### Fixed
- `visibleTextEditors` replaced with `textDocuments` to include all open tabs
- Ensured dirty files are handled correctly based on user input

## [0.1.0] - 2025-05-02

### Added
- Save and load named file sessions
- JSON-based session storage under `~/.vscode-session-builder/`
- Load/Delete/List session commands in Command Palette
- Extension icon and Marketplace publishing support
