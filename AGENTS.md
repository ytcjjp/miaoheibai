# Project Workflow

- The canonical project directory is `D:\子弦\miaoheibai`. Use it explicitly as the working directory. Create project files and generated outputs inside this directory, not the former Chinese-named project directories.
- Build Android packages with `./build-apk.ps1`. It resolves the toolchain and output paths from its own location. APK files belong in the project root.
- Do not use a physical Android device or emulator unless the user explicitly asks. Use local checks and package the APK instead.
- After completing and verifying each requested change and building the APK, automatically commit the task's related source files and APK outputs, then push the current branch to `origin`. The user has authorized this workflow; no repeated confirmation is needed.
- Check Git status and staged changes. Leave unrelated user changes uncommitted. Keep toolchains, caches, local credentials, and signing secrets out of Git. Do not force-push.
- Keep the existing Android application ID and signing identity so updates can be installed over previous versions without losing app data.
