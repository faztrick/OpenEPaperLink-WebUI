# Future Enhancements (Next.js Migration)

1. Data Fetching Layer
   - Implement SWR/React Query for caching device/tag lists.
   - WebSocket or Server-Sent Events for real-time logs & status.
2. Authentication (if needed)
   - Add API route /api/auth with token exchange.
3. Theming & Design System
   - Introduce CSS variables / tailwind / radix components for consistency.
4. Testing
   - Jest + React Testing Library for components.
   - Playwright for e2e flows (flash device, configure wifi, etc.).
5. Performance
   - Analyze bundle via `next build` + `next analyze` plugin.
6. Internationalization
   - Integrate next-intl or next-i18next reusing `languages.json`.
7. Error Handling
   - Error boundary component and toast system.
8. Accessibility
   - Run axe checks and ensure semantic markup replaces legacy div soup.
9. API Types
   - Derive TypeScript interfaces from existing JSON schema/responses.
10. Deployment

- Evaluate static export vs Node server vs edge runtime.
