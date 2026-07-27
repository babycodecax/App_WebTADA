@echo off
REM Sync frontend: root/ -> api/public/ + backend/static/
REM Run from App_WebTADA root
REM IMPORTANT: root/ is single source of truth for all common files.
REM If a file belongs in the frontend, put it in root/ first, then run this script.

set ROOT=%CD%

echo === STEP 1: Copy HTML from root to both destinations ===
copy /Y "%ROOT%\index.html" "%ROOT%\api\public\index.html"
copy /Y "%ROOT%\blog.html" "%ROOT%\api\public\blog.html"
copy /Y "%ROOT%\admin.html" "%ROOT%\api\public\admin.html"

echo === STEP 2: Sync css/ from root ===
xcopy /Y /E /I "%ROOT%\css\*" "%ROOT%\api\public\css\"
xcopy /Y /E /I "%ROOT%\css\*" "%ROOT%\backend\static\css\"

echo === STEP 3: Sync js/ from root ===
xcopy /Y /E /I "%ROOT%\js\*" "%ROOT%\api\public\js\"
xcopy /Y /E /I "%ROOT%\js\*" "%ROOT%\backend\static\js\"

echo === STEP 4: Sync img/ from root ===
xcopy /Y /E /I "%ROOT%\img\*" "%ROOT%\api\public\img\"
xcopy /Y /E /I "%ROOT%\img\*" "%ROOT%\backend\static\img\"

echo === STEP 5: Safety net — copy missing files from backend/static to api/public ===
xcopy /Y /E /I "%ROOT%\backend\static\js\*" "%ROOT%\api\public\js\"
xcopy /Y /E /I "%ROOT%\backend\static\css\*" "%ROOT%\api\public\css\"

echo Done! Frontend synced to api/public/ and backend\static/
