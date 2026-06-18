# 踏风 Tafeng

踏风是一个面向 Cloudflare Worker 部署的 WebSSH 工作台原型，使用 React + Vite + TypeScript 构建。项目采用纯 Worker 架构：前端静态资源、认证、设置、连接管理、命令历史、文件接口、WebSocket 终端桥接都由 Cloudflare Worker 承载。

English documentation: [Readme_EN.md](./Readme_EN.md)

## 功能概览

- WebSSH 终端工作台，界面风格接近 macOS Terminal。
- 支持保存 VPS 连接信息：IP / 域名、端口、用户名、密码或私钥。
- 首页管理密码登录，设置中可开启两步验证。
- 中文 / English 双语界面。
- 文件列表、文本配置编辑器、上传和下载接口。
- 上传接口设计上限为 10G。
- 连接后显示 CPU、内存、Swap、硬盘使用情况和进程列表。
- 全局命令历史记录，所有 VPS 共用，最多保存 100000 条。
- Cloudflare Worker + KV + R2 部署结构。
- 后续真实 SSH/SFTP 接入统一走 Worker TCP Socket 方案。

## 当前状态说明

当前项目已经完成前端、Worker API、认证、设置、连接管理、命令历史、文件接口和监控面板骨架。真实 SSH/SFTP 协议接入被隔离在 [worker/sshBridge.ts](./worker/sshBridge.ts)，目前是可运行的开发桥接模式。

方案 A 的目标是只部署 Cloudflare Worker，不额外部署传统后端。后续接入真实 SSH 时，建议在 `worker/sshBridge.ts` 中使用 Cloudflare Worker 的 `cloudflare:sockets` TCP Socket API 连接 VPS 的 `22` 端口，并在 Worker 内完成 SSH 协议桥接。

## 目录结构

```text
tafeng/
├── src/                 # React + Vite + TypeScript 前端
├── worker/              # Cloudflare Worker API 与 WebSocket 服务
├── shared/              # 前后端共用类型
├── public/              # 静态资源目录
├── dist/client/         # 前端构建产物，不提交 Git
├── wrangler.toml        # Cloudflare Worker 配置
├── package.json         # 前端和 Worker 脚本
└── LICENSE              # MIT License
```

## 环境要求

- Node.js 18 或更高版本，推荐 Node.js 20+。
- npm 9 或更高版本。
- Cloudflare 账号。
- Wrangler CLI。本项目已把 `wrangler` 放在 devDependencies 中，可以直接使用 `npm run worker:dev` 和 `npm run worker:deploy`。

## 网页部署到 Cloudflare Worker

这是推荐给普通用户的部署方式：从 GitHub Fork 开始，主要在 GitHub 网页和 Cloudflare Dashboard 里完成，不需要在本地运行命令。

### 1. Fork 项目到自己的 GitHub

1. 打开本项目的 GitHub 仓库页面。
2. 点击右上角 `Fork`。
3. Owner 选择你自己的 GitHub 账号或组织。
4. Repository name 可以保持 `tafeng`，也可以改成你喜欢的名字。
5. 点击 `Create fork`。

完成后，你会得到一个自己的仓库，例如：

```text
https://github.com/你的用户名/tafeng
```

后续所有配置都建议改你自己 Fork 出来的仓库，不要直接改上游仓库。

### 2. 在 Cloudflare 创建 KV

踏风需要 KV 保存登录会话、设置、VPS 连接信息和命令历史。

1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com/)。
2. 进入左侧 `Storage & Databases`。
3. 打开 `KV`。
4. 点击 `Create namespace`。
5. 创建生产 KV，名称建议填写：

```text
tafeng-kv
```

6. 再创建一个预览 KV，名称建议填写：

```text
tafeng-kv-preview
```

7. 记住这两个 Namespace 名称。后面会在 Worker 设置中手动绑定，不需要把 KV ID 写入 `wrangler.toml`。

### 3. 在 Cloudflare 创建 R2 Bucket

踏风使用 R2 作为上传文件和大文件中转存储。

1. 在 Cloudflare Dashboard 左侧进入 `R2 Object Storage`。
2. 点击 `Create bucket`。
3. 创建生产 Bucket：

```text
tafeng-files
```

4. 再创建预览 Bucket：

```text
tafeng-files-preview
```

Bucket 名称可以使用上面的推荐值，也可以自定义。后面会在 Worker 设置中选择 Bucket 并绑定，不需要把 Bucket 名称写入 `wrangler.toml`。

### 4. 在 Cloudflare 连接 GitHub 仓库

Cloudflare Workers 支持从 GitHub 仓库构建和部署。官方入口可能会随 Dashboard 改版微调，但大致路径如下：

1. 打开 Cloudflare Dashboard。
2. 进入 `Workers & Pages`。
3. 点击 `Create` 或 `Create application`。
4. 选择从 Git 仓库导入，通常显示为 `Import a repository`、`Connect to Git` 或类似入口。
5. 选择 `GitHub`。
6. 如果是第一次连接，Cloudflare 会要求授权 GitHub App。
7. 授权时选择你 Fork 的 `tafeng` 仓库。
8. 回到 Cloudflare，选择该仓库和要部署的分支，通常是 `main`。

如果页面让你选择项目类型，选择 `Workers`，不要选择普通静态 Pages 项目。

### 5. 填写构建配置

Cloudflare 会读取 [wrangler.toml](./wrangler.toml) 中的 Worker 入口和静态资源设置。若页面要求手动填写，请使用下面的配置：

```text
Project name: tafeng
Production branch: main
Root directory: /
Build command: npm run build
Deploy command: npm run worker:deploy
Node.js version: 20
```

如果页面要求填写静态资源目录或输出目录，填写：

```text
dist/client
```

如果页面只提供一个命令输入框，优先填写：

```bash
npm run build && npm run worker:deploy
```

注意：不同版本的 Cloudflare Workers Git 集成页面字段可能略有不同。核心原则是先执行 `npm run build` 生成 `dist/client`，再部署 Worker。

### 6. 先完成第一次部署

点击 `Deploy`、`Save and deploy` 或类似按钮，先让 Cloudflare 从 GitHub 拉取代码并完成第一次部署。

第一次部署后，页面可能还不能正常登录，因为还没有给 Worker 绑定 KV 和 R2。这是正常的，继续下一步即可。

### 7. 在网页手动绑定 KV 和 R2

进入刚创建的 `tafeng` Worker：

1. 打开 Cloudflare Dashboard。
2. 进入 `Workers & Pages`。
3. 打开 `tafeng` Worker。
4. 进入 `Settings`。
5. 找到 `Bindings`，有些界面会显示在 `Variables and Secrets` 或 `Resources` 里。

添加 KV Namespace 绑定：

```text
Binding type: KV Namespace
Variable name: TAFENG_KV
KV namespace: tafeng-kv
```

如果页面区分 Preview 环境，也给 Preview 绑定：

```text
Variable name: TAFENG_KV
KV namespace: tafeng-kv-preview
```

添加 R2 Bucket 绑定：

```text
Binding type: R2 Bucket
Variable name: TAFENG_FILES
R2 bucket: tafeng-files
```

如果页面区分 Preview 环境，也给 Preview 绑定：

```text
Variable name: TAFENG_FILES
R2 bucket: tafeng-files-preview
```

绑定名必须完全一致：

```text
TAFENG_KV
TAFENG_FILES
```

代码里通过这两个名字读取 KV 和 R2。名字写错会导致登录、设置、连接信息、命令历史或文件上传失败。

### 8. 设置环境变量和密钥

首次部署可能可以用默认密码 `tafeng` 进入，但生产环境必须设置自己的管理密码。

仍然在 Worker 的设置页面中：

1. 打开 `Variables and Secrets`。
2. 添加 Secret：

```text
名称: ADMIN_PASSWORD
值: 你的强管理密码
```

可选再添加：

```text
名称: SESSION_SECRET
值: 一串随机长字符串
```

如果页面区分 `Production` 和 `Preview` 环境，建议至少在 `Production` 中设置 `ADMIN_PASSWORD`。

### 9. 重新部署

绑定 KV/R2 并设置 Secret 后，建议重新部署一次：

1. 进入 Worker 的 `Deployments` 或 `Builds` 页面。
2. 找到最新一次部署。
3. 点击 `Retry deployment`、`Redeploy` 或类似按钮。

也可以在 GitHub 网页里对 README 做一个很小的修改并提交，触发 Cloudflare 自动重新构建部署。

### 10. 访问踏风

部署成功后，Cloudflare 会给你一个 `workers.dev` 地址，例如：

```text
https://tafeng.你的子域.workers.dev
```

打开地址后：

1. 输入 `ADMIN_PASSWORD` 中设置的管理密码。
2. 进入控制台。
3. 在左侧添加 VPS 连接信息。
4. 当前版本仍是开发桥接模式，真实 SSH/SFTP 需要后续在 [worker/sshBridge.ts](./worker/sshBridge.ts) 中接入 Worker TCP Socket。

### 11. 配置自定义域名

如果你想使用自己的域名：

1. 打开 Cloudflare Dashboard。
2. 进入 `Workers & Pages`。
3. 打开 `tafeng` Worker。
4. 进入 `Settings`。
5. 打开 `Domains & Routes`。
6. 添加自定义域名或路由。

例如：

```text
ssh.example.com
```

保存后，等待 DNS 和证书生效即可访问。

## 本地开发

安装依赖：

```bash
npm install
```

启动 Vite 前端开发服务：

```bash
npm run dev
```

默认访问地址：

```text
http://localhost:5173/
```

构建前端并启动本地 Worker：

```bash
npm run build
npm run worker:dev
```

Worker 默认访问地址：

```text
http://localhost:8787/
```

本地开发默认管理密码是：

```text
tafeng
```

生产环境不要使用默认密码，请配置 `ADMIN_PASSWORD` Secret。

## Cloudflare 资源准备

踏风部署到 Cloudflare Worker 时需要两个资源：

- KV Namespace：保存设置、会话、VPS 连接信息、命令历史索引和命令历史条目。
- R2 Bucket：保存上传文件或大文件中转数据。

### 1. 登录 Cloudflare

```bash
npx wrangler login
```

如果是在无浏览器的服务器上部署，可以改用 Cloudflare API Token，并设置环境变量：

```bash
export CLOUDFLARE_API_TOKEN="your-cloudflare-api-token"
```

API Token 至少需要 Worker、KV、R2 相关权限。

### 2. 创建 KV Namespace

创建生产 KV：

```bash
npx wrangler kv namespace create TAFENG_KV
```

创建预览 KV：

```bash
npx wrangler kv namespace create TAFENG_KV --preview
```

创建完成后，不需要把 KV ID 写入 [wrangler.toml](./wrangler.toml)。请在 Cloudflare Dashboard 的 Worker 设置中手动添加 KV 绑定：

```text
Variable name: TAFENG_KV
KV namespace: tafeng-kv
```

### 3. 创建 R2 Bucket

创建生产 Bucket：

```bash
npx wrangler r2 bucket create tafeng-files
```

创建预览 Bucket：

```bash
npx wrangler r2 bucket create tafeng-files-preview
```

创建完成后，不需要把 Bucket 名称写入 [wrangler.toml](./wrangler.toml)。请在 Cloudflare Dashboard 的 Worker 设置中手动添加 R2 绑定：

```text
Variable name: TAFENG_FILES
R2 bucket: tafeng-files
```

### 4. 设置管理密码

生产环境必须设置管理密码：

```bash
npx wrangler secret put ADMIN_PASSWORD
```

根据提示输入你的管理密码。

可选：设置会话密钥。当前代码预留了 `SESSION_SECRET`，后续如果你扩展签名会话或加密存储，可以使用它：

```bash
npx wrangler secret put SESSION_SECRET
```

## 构建与部署

### 1. 类型检查

```bash
npm run typecheck
```

### 2. 构建前端

```bash
npm run build
```

构建完成后，静态文件会输出到：

```text
dist/client/
```

### 3. 部署 Worker

```bash
npm run worker:deploy
```

部署成功后，Wrangler 会输出 Worker 访问地址，例如：

```text
https://tafeng.your-subdomain.workers.dev
```

打开这个地址，输入你通过 `ADMIN_PASSWORD` 配置的管理密码即可进入。

## 自定义域名

可以在 Cloudflare Dashboard 中为 Worker 绑定自定义域名：

1. 进入 Cloudflare Dashboard。
2. 打开 Workers & Pages。
3. 选择 `tafeng` Worker。
4. 进入 Settings。
5. 在 Domains & Routes 中添加自定义域名或路由。

## 真实 SSH/SFTP 接入路线

项目现在保留的是 Worker 内适配层：

```text
worker/sshBridge.ts
```

接入真实 SSH 时建议这样做：

1. 在 Worker WebSocket 中接收浏览器终端输入。
2. 在 Worker 内使用 `cloudflare:sockets` 的 `connect()` 创建到 VPS `host:22` 的出站 TCP 连接。
3. 在 Worker 内实现或引入可用的 SSH 协议适配逻辑。
4. 将浏览器 WebSocket 数据和 SSH TCP Socket 数据互相转发。
5. SFTP 文件传输也走同一个 Worker 适配层，必要时配合 R2 做临时对象中转。

注意事项：

- Worker 只能创建出站 TCP 连接，不能像传统服务器一样监听任意 TCP 端口。
- 真实 SSH 协议、SFTP、大文件传输和长连接要注意 Worker 限制、超时、内存和并发连接数量。
- 10G 大文件建议先写入 R2，再由 Worker 分段处理或任务化处理，避免一次性读入内存。

## 两步验证

踏风已经支持基于 TOTP 的两步验证，并会在网页里提供二维码。

启用步骤：

1. 登录踏风控制台。
2. 点击顶部设置栏中的 `启用两步验证`。
3. 页面会弹出二维码和手动密钥。
4. 使用 Google Authenticator、Microsoft Authenticator、1Password、Bitwarden 等支持 TOTP 的应用扫描二维码。
5. 在弹窗中输入 Authenticator 应用显示的 6 位验证码。
6. 点击 `确认启用`。

启用后，之后登录需要同时输入：

- 管理密码
- Authenticator 应用中的 6 位动态验证码

关闭步骤：

1. 登录踏风控制台。
2. 点击顶部设置栏中的 `两步验证已启用`。
3. Worker 会清除已保存的 TOTP 密钥，并关闭两步验证。

TOTP 密钥会保存在 `TAFENG_KV` 中。生成二维码时会先保存一个 10 分钟有效的待确认密钥，只有验证码校验通过后才会正式启用。

相关入口在：

- [worker/auth.ts](./worker/auth.ts)
- [src/components/SettingsPanel.tsx](./src/components/SettingsPanel.tsx)

## 文件上传下载

上传接口位于：

```text
POST /api/files/upload
```

当前 Worker 会检查 `Content-Length`，超过 10G 会返回 `413`。文件内容会写入 R2 Bucket：

```text
TAFENG_FILES
```

真实 SFTP 上传下载接入后，建议流程为：

1. 浏览器上传到 Worker。
2. Worker 将大文件流式写入 R2 临时对象。
3. Worker 的 SSH/SFTP 适配层从 R2 读取并上传到 VPS。
4. 任务完成后删除临时对象。

## 命令历史记录

踏风会全局保存所有 VPS 执行过的命令，最多保存 100000 条。

接口：

```text
GET /api/command-history?limit=300&offset=0
DELETE /api/command-history
```

存储方式：

- KV 中保存一个全局索引。
- 每条命令单独保存为 KV 条目。
- 超过 100000 条时自动删除最旧记录。

## 多语言

目前支持：

- 中文
- English

前端语言字典位于：

```text
src/lib/i18n.ts
```

如需增加新语言：

1. 在 `shared/types.ts` 中扩展 `Language` 类型。
2. 在 `src/lib/i18n.ts` 中增加对应字典。
3. 在 `SettingsPanel` 的语言选择器中增加选项。

## 安全建议

生产部署前建议完成以下事项：

- 设置强管理密码：`npx wrangler secret put ADMIN_PASSWORD`。
- 启用两步验证，并妥善保存 Authenticator 恢复方式。
- 不要明文长期保存 SSH 密码或私钥，建议使用加密存储。
- 为 KV 中保存的 VPS 凭据增加加密层。
- 限制 Worker 访问来源或增加额外访问控制。
- 定期清理不需要的命令历史。
- 为 R2 临时上传对象设置清理策略。
- 真实 SSH 接入时做好连接超时、命令审计和错误处理。

## 常用命令

```bash
# 安装依赖
npm install

# 启动前端开发服务
npm run dev

# 类型检查
npm run typecheck

# 构建前端
npm run build

# 本地运行 Worker
npm run worker:dev

# 部署 Worker
npm run worker:deploy
```

## 常见问题

### 1. 打开页面后无法登录

请确认已经设置生产管理密码：

```bash
npx wrangler secret put ADMIN_PASSWORD
```

本地开发没有设置 Secret 时，默认密码是 `tafeng`。

### 2. 登录或设置接口提示 KV 相关错误

请确认 Cloudflare Dashboard 中已经给 Worker 添加 KV 绑定：

```text
Variable name: TAFENG_KV
KV namespace: tafeng-kv
```

绑定名必须是 `TAFENG_KV`，大小写不能变。

### 3. 文件上传失败

请确认 R2 Bucket 已创建，并且 Cloudflare Dashboard 中已经给 Worker 添加 R2 绑定：

```text
Variable name: TAFENG_FILES
R2 bucket: tafeng-files
```

绑定名必须是 `TAFENG_FILES`，大小写不能变。

### 4. 终端现在没有连接真实 VPS

这是当前原型的预期行为。真实 SSH/SFTP 需要在 [worker/sshBridge.ts](./worker/sshBridge.ts) 中接入 Worker TCP Socket 和 SSH 协议逻辑。

### 5. 命令历史是否按 VPS 隔离

不是。当前设计是全局历史记录，不管哪个 VPS，所有执行过的命令都会进入同一个历史列表，最多保存 100000 条。

## 开源协议

本项目采用 MIT License。你可以自由使用、修改、分发和用于商业项目，但需要保留版权与许可声明。详见 [LICENSE](./LICENSE)。
