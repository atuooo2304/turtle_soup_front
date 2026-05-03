<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/5893e7ea-1c1c-4549-a386-ae3cfe8981cd

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy [.env.example](.env.example) to `.env.local` and set `COZE_TOKEN`, `COZE_BOT_ID`（参见示例中说明）
3. Run the app:
   `npm run dev`

## Coze 主持与通关判定

- 对局由扣子 Bot 主持；环境变量与 `.env.example` 一致。
- 前端在 [`src/App.tsx`](src/App.tsx) 的 `hostIndicatesSuccess` 中根据**主持人口播关键词**判断是否弹出结算；若你在 Coze 里修改通关话术（如「解谜成功！」），请同步更新该函数内的关键词列表，或后续改为 BFF 返回结构化字段。
