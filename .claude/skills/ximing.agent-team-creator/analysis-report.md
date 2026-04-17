# Project Analysis Report: aimo-note-refactor

## Files to DELETE

### Old Page Components (apps/render/src/pages/)
- `apps/render/src/pages/ai-explore/` - AI exploration page (old cloud feature)
- `apps/render/src/pages/auth/` - Authentication pages (login/register)
- `apps/render/src/pages/gallery/` - Media gallery page (old cloud feature)
- `apps/render/src/pages/home/` - Home page with memo list (old app UI)
- `apps/render/src/pages/landing/` - Landing page (marketing page)
- `apps/render/src/pages/not-found/` - 404 page
- `apps/render/src/pages/review/` - Spaced repetition review (old cloud feature)
- `apps/render/src/pages/settings/` - Settings pages with push-rules, spaced-repetition (old cloud features)
- `apps/render/src/pages/share/` - Share page (old cloud feature)
- `apps/render/src/pages/trash/` - Trash page (old app feature)

### Old API Services (apps/render/src/api/)
- `apps/render/src/api/ai.ts`
- `apps/render/src/api/attachment.ts`
- `apps/render/src/api/auth.ts`
- `apps/render/src/api/category.ts`
- `apps/render/src/api/explore-conversation.ts`
- `apps/render/src/api/explore.ts`
- `apps/render/src/api/export.ts`
- `apps/render/src/api/memo.ts`
- `apps/render/src/api/notification.ts`
- `apps/render/src/api/ocr.ts`
- `apps/render/src/api/push-rules.ts`
- `apps/render/src/api/review.ts`
- `apps/render/src/api/spaced-repetition.ts`
- `apps/render/src/api/system.ts`
- `apps/render/src/api/tag.ts`
- `apps/render/src/api/trash.ts`
- `apps/render/src/api/user-feature-config.ts`
- `apps/render/src/api/user-model.ts`
- `apps/render/src/api/user.ts`

### Old Services (apps/render/src/services/)
- `apps/render/src/services/ai-tools.service.ts`
- `apps/render/src/services/attachment.service.ts`
- `apps/render/src/services/auth.service.ts`
- `apps/render/src/services/category.service.ts`
- `apps/render/src/services/draft.service.ts`
- `apps/render/src/services/explore.service.ts`
- `apps/render/src/services/export.service.ts`
- `apps/render/src/services/import.service.ts`
- `apps/render/src/services/memo-polling.service.ts`
- `apps/render/src/services/memo.service.ts`
- `apps/render/src/services/notification.service.ts`
- `apps/render/src/services/tag.service.ts`
- `apps/render/src/services/theme.service.ts`
- `apps/render/src/services/toast.service.ts`
- `apps/render/src/services/trash.service.ts`
- `apps/render/src/services/user-model.service.ts`

### Old Components (apps/render/src/components/)
- `apps/render/src/components/ai/` - AI-related modals
- `apps/render/src/components/attachment-preview-modal.tsx`
- `apps/render/src/components/attachment-uploader.tsx`
- `apps/render/src/components/calendar-heatmap.tsx`
- `apps/render/src/components/layout.tsx`
- `apps/render/src/components/memo-editor-form.tsx`
- `apps/render/src/components/protected-route.tsx`
- `apps/render/src/components/tag-context-menu.tsx`
- `apps/render/src/components/tag-input.tsx`
- `apps/render/src/components/toast/` - Toast notification system

### Old Assets (apps/render/src/assets/)
- `apps/render/src/assets/icons/` - Audio/pdf/video icons
- `apps/render/src/assets/landing/` - Landing page images
- `apps/render/src/assets/logo-dark.png`
- `apps/render/src/assets/logo.png`
- `apps/render/src/assets/logo.svg`
- `apps/render/src/assets/react.svg`

### Old DTOs (packages/dto/src/)
- `packages/dto/src/ai.ts`
- `packages/dto/src/asr.ts`
- `packages/dto/src/attachment.ts`
- `packages/dto/src/auth.ts`
- `packages/dto/src/category.ts`
- `packages/dto/src/explore.ts`
- `packages/dto/src/insights.ts`
- `packages/dto/src/memo.ts` - May need review
- `packages/dto/src/push-rule.ts`
- `packages/dto/src/review.ts`
- `packages/dto/src/tag.ts`
- `packages/dto/src/user-model.ts`
- `packages/dto/src/user.ts`
- `packages/dto/src/version.ts`
- `packages/dto/dist/` - All compiled output

### Scripts Directory
- `scripts/` - Entire directory (deploy.sh, export_memos.py, ralph/, release-tag.sh, test-asr.sh, verify-production.sh)

### CI/CD Workflows (.github/workflows/)
- `.github/workflows/ci.yml` - References old apps/server, apps/web
- `.github/workflows/build-electron.yml` - References old @aimo-note/web
- `.github/workflows/docker-build.yml` - For old Docker setup
- `.github/workflows/docker-migrate.yml` - For old migration
- `.github/workflows/README.md`

### Docker/Infrastructure Files
- `docker-compose.yml` - References MySQL, LanceDB, old app service
- `Dockerfile` - For old app
- `.dockerignore`

### Config Files to DELETE
- `config/config-typescript/nextjs.json` - Next.js specific
- `config/jest-presets/` - Jest configs (not using Jest)

### Other
- `aihub.config.mjs` - References old catpaw skills
- `packages/dto/.turbo/` - Turbo build logs
- `packages/logger/coverage/` - Test coverage reports
- `packages/logger/.turbo/` - Turbo build logs
- `packages/logger/lib/__tests__/` - Old test outputs

---

## Files to KEEP

### Core Infrastructure
- `package.json` - Root package.json
- `pnpm-workspace.yaml` - pnpm workspace config
- `pnpm-lock.yaml` - Lock file
- `turbo.json` - Turbo monorepo config
- `tsconfig.json` - Root TypeScript config

### Config Files
- `config/config-typescript/base.json` - Base TypeScript config
- `config/config-typescript/react-app.json` - React app TypeScript config
- `config/config-typescript/react-library.json` - React library TypeScript config
- `config/config-typescript/vite.json` - Vite TypeScript config
- `config/config-typescript/package.json` - Config package
- `config/eslint-config/base.js` - ESLint base config
- `config/eslint-config/react.js` - ESLint React config
- `config/eslint-config/package.json` - ESLint config package
- `config/rollup-config/index.js` - Rollup config
- `config/rollup-config/package.json` - Rollup config package

### Tooling Configs
- `.eslintrc.js` - ESLint config
- `.prettierignore` - Prettier ignore
- `prettier.config.mjs` - Prettier config
- `.npmrc` - npm config
- `.nvmrc` - Node version
- `commitlint.config.js` - Commit lint config
- `.gitignore` - Git ignore

### Git Hooks
- `.husky/` - Husky git hooks directory

### Apps Structure (to be refactored)
- `apps/client/` - Electron desktop shell (main process code)
  - `apps/client/src/main/` - Electron main process
  - `apps/client/src/preload/` - Preload scripts
  - `apps/client/package.json`
  - `apps/client/vite.config.ts`
  - `apps/client/tsconfig.json`
  - `apps/client/electron-builder.yml`
  - `apps/client/build/` - Build icons
  - `apps/client/index.html`

- `apps/render/` - React frontend
  - `apps/render/package.json`
  - `apps/render/vite.config.ts`
  - `apps/render/tsconfig.*.json`
  - `apps/render/tailwind.config.js`
  - `apps/render/postcss.config.js`
  - `apps/render/index.html`
  - `apps/render/eslint.config.js`
  - `apps/render/src/App.tsx`
  - `apps/render/src/main.tsx`
  - `apps/render/src/index.css`
  - `apps/render/src/electron/` - Electron detection

### Packages
- `packages/dto/` - DTO package (need to rewrite contents)
  - `packages/dto/package.json`
  - `packages/dto/tsconfig.json`
  - `packages/dto/eslint.config.mjs`
  - `packages/dto/rollup.config.js`
  - `packages/dto/src/index.ts` - Keep this, delete others

- `packages/logger/` - Logger package
  - `packages/logger/package.json`
  - `packages/logger/tsconfig.json`
  - `packages/logger/eslint.config.js`
  - `packages/logger/jest.config.js`
  - `packages/logger/build.config.ts`
  - `packages/logger/src/` - Source files
  - `packages/logger/README.md`
  - `packages/logger/EXAMPLE.md`

---

## Notes

1. **apps/render/src/pages/home/components/** - Contains memo-related components (memo-card, memo-detail-modal, memo-editor, memo-list, etc.) that may be useful reference for the new local-first app but are tightly coupled to the old API. Consider for reference only.

2. **packages/dto** - The DTO package needs significant rework. The old DTOs (ai, asr, auth, explore, ocr, push-rule, review, spaced-repetition) are for cloud features. Only keep the package structure.

3. **Old CI workflows reference apps/server and apps/web** - These apps don't exist in this repo. The CI was for a different structure.

4. **.catpaw/ directory does not exist** - The aihub.config.mjs references .catpaw/skills but this directory doesn't exist in the project root.

5. **Docker setup** - The docker-compose.yml and Dockerfile are for a full-stack app with MySQL + LanceDB backend, not relevant for local-first desktop app.

6. **Key tech to preserve**: pnpm workspace + turbo monorepo, React 19 + Vite + Tailwind, Electron shell, TypeScript configs, ESLint/Prettier configs.
