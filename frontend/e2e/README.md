# E2E Testing with Playwright

## Running Tests

### Run all tests
```bash
npx playwright test
```

### Run specific test
```bash
npx playwright test e2e/workflow-complete.spec.ts
```

### UI/UX regression checks with local fixtures

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
NEXT_PUBLIC_SUPABASE_ANON_KEY=local-demo \
BACKEND_API_URL=http://127.0.0.1:16081 \
npx playwright test e2e/uiux-regressions.spec.ts --project=chromium-guest --workers=1
```

These checks use demo digests and mocked browser authentication/profile responses;
they do not submit video jobs, send sign-in emails, or open checkout. They cover
public policies, auth return paths, library density and return position, keyboard
language selection, and pricing controls. Screenshots are written to the ignored
`output/playwright/` directory at the repository root.

### Run with UI Mode (Debugging)
```bash
npx playwright test --ui
```

### Update Visual Snapshots
```bash
npx playwright test --update-snapshots
```

## Architecture

### Page Object Model (POM)
We use the Page Object Model pattern to organize test interactions.
Page objects are located in `e2e/pages/`.
- `AuthPage`: Login interactions
- `ChatPage`: Chat interface interactions
- `SettingsPage`: Settings page interactions

### Test Data Factory
We use a factory pattern to generate mock data.
Located in `e2e/fixtures/testData.ts`.
Use `createMockTask`, `createMockUser`, etc., to generate consistent data objects.

### Browser Support
- **Chromium**: Runs all tests (Guest + Authenticated + Setup)
- **Firefox**: Runs smoke/workflow tests only (to save CI time)
- **WebKit (Safari)**: Runs smoke/workflow tests only (to save CI time)

## CI Configuration
- CI runs `npx playwright test`.
- Uses `NEXT_PUBLIC_E2E_MOCK=1` to mock backend interactions.
- `auth.setup.ts` mocks Supabase Auth network requests to ensure stability in CI without real credentials.
