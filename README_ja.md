# Obsidian向け Riebeckite

Riebeckiteは、ローカルの[Riebeckite](https://github.com/Rerurate514/riebeckite)
開発サーバーへObsidianを接続します。Bridgeの状態を読み取るだけで、ノートの公開や
Vaultデータの変更は行いません。

English: [README.md](./README.md)

## 開発状況

Bridge Protocol v1による状態取得を実装済みです。Diagnostics、コンテンツ検査、Preview、
公開状態の検査は意図的に未実装です。

## Riebeckiteへの接続

1. 32文字以上の一意なペアリングトークンを指定してサイトを起動します。
   `riebeckite dev --bridge-token <token>`
2. **Riebeckite** の設定でローカルサーバーURLと同じトークンを入力します。
3. **Connect** を選ぶか、**Riebeckite: Connect to Riebeckite** を実行します。

`localhost`、`127.0.0.0/8`、`::1` 以外のURLは受け付けません。Bridgeはトークン指定時だけ
有効になり、loopbackだけで待ち受けます。Cross-Originおよび転送ヘッダー付きのリクエストは
受け付けません。ペアリングが拒否される場合は、トークンの不一致か、サーバーを
`--bridge-token` 付きで起動していないことを確認してください。

## 手動インストール

1. `pnpm build` でプラグインをビルドします。
2. `<vault>/.obsidian/plugins/riebeckite/` を作成します。
3. `main.js` と `manifest.json` をそのディレクトリへコピーします。
4. Obsidianの **Community plugins** で **Riebeckite** を有効にします。

## 開発方法

Node.js 24.22.0とCorepackが必要です。`packageManager` でpnpm 11.5.3を固定しています。

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` は `src/main.ts` を監視し、`main.js` を出力します。手動インストールに必要な
2ファイルを開発用Vaultへリンクまたはコピーし、再ビルド後にObsidianでプラグインを
再読み込みしてください。

### コマンド

```bash
pnpm check
pnpm check:fix
pnpm lint
pnpm format
pnpm typecheck
pnpm test
pnpm build
pnpm check:manifest
pnpm test:release
pnpm build:release
```

`build:release` は、ビルドとObsidian配布に必要なファイルの検証を行います。

## Obsidianでの手動検証

1. 上記の手順でテスト用Vaultへビルド成果物を導入します。
2. プラグインを有効化し、**Riebeckite: Open settings** を実行して設定タブが開くことを確認します。
3. **Riebeckite Server URL** と **Bridge pairing token** を入力し、設定タブを開き直して
   両方の値が保存されることを確認します。
4. **Connect** を選び、RiebeckiteとProtocolのバージョン、および `status` capabilityが
   接続状態に表示されることを確認します。
5. **Disconnect** を選んだ後にプラグインを無効化・再有効化し、コマンドが重複登録されないことを確認します。

## リリース

1. `package.json` をリリース対象のセマンティックバージョンに更新します。
2. `pnpm sync:version` を実行し、`package.json`、`manifest.json`、`versions.json` を同じコミットに含めます。
3. `pnpm build:release` を実行します。
4. 対応する `v<version>` タグを作成してpushします。Releaseワークフローはタグを検証した後、
   `main.js` と `manifest.json` をGitHub Releaseに配置します。
5. Obsidian本体で手動検証し、その時点の申請要件を確認してからCommunity Pluginsへ申請します。

このワークフローはnpm公開およびObsidianディレクトリへの申請を行いません。

## ライセンス

[Apache-2.0](./LICENSE)
