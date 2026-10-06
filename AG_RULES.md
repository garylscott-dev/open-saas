# Autonomous Repository Rules for Antigravity

When tasked with code modifications or feature requests, execute the following full workflow:

1. **Context & Branching:**
   - Inspect working tree (`git status`).
   - Create a unique feature branch: `git checkout -b feat/ag-$(date +%s)`

2. **Development & Testing:**
   - Apply requested code changes.
   - Run project test suites or linters (e.g., `pytest`, `npm test`, or syntax checks) if available.
   - Do not commit code that breaks existing tests.

3. **Commit & Push:**
   - Stage modified files: `git add .`
   - Commit with Conventional Commit formatting: `git commit -m "<type>: <concise description>"`
   - Push branch to GitHub: `git push -u origin HEAD`

4. **Pull Request Creation:**
   - Open a GitHub PR automatically: `gh pr create --title "<PR Title>" --body "<Summary of changes and test results>" --head HEAD`
   - Return the final PR link.
