@echo off
cd /d "D:\CodeApp\Projects\obsidian-chatbot"
set ANTHROPIC_BASE_URL=http://localhost:20128/v1
set ANTHROPIC_API_KEY=sk-0f08089bbe7bdf07-7vzxxt-ba217387
set ANTHROPIC_MODEL=Test
claude %*
