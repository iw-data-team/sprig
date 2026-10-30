# Sprig

A small, keyboard-first mindmap editor. Vietnamese interface; powered by React, Vite and [Mind Elixir](https://github.com/SSShooter/mind-elixir-core) (MIT).

- Start with a single editable topic. Double click or F2 to edit.
- Tab creates a child; Enter creates a sibling, including while typing. Enter at the root creates a child.
- Shift+Enter inserts a line break while editing. Esc cancels text edits.
- Change font size, weight, text and branch color; undo/redo, pan, zoom, collapse branches.
- Multiple maps save locally in the current browser. No login, backend or cloud sync.
- Export/import JSON for editable backups; export SVG/PNG for images.

## Development

Requires Node.js 24 and npm.

```sh
npm ci
npm run dev
npm test
npm run lint
npm run build
```

Open the URL Vite prints, under `/sprig/`. `dist/` is the complete static site. The base URL is configured in `vite.config.ts`.

## Hosting

Public deployment: https://iw-data-team.github.io/sprig/

GitHub Actions builds and deploys `main` to GitHub Pages. Public repositories and static Pages hosting are free within GitHub's [usage limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits); no paid backend is required.

Maps remain in localStorage on each browser and origin. Export JSON regularly: clearing site data removes local maps. Sharing the website URL shares the app, not your private maps. Collaboration and cross-device synchronization are outside this first version. JSON import accepts up to 5 MB, 3,000 nodes and 60 levels, and only a plain-text subset of engine data.

## License

MIT. Third-party dependencies retain their respective licenses.
