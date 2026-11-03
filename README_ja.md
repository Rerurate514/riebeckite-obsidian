# Obsidian向け Riebeckite

Riebeckiteは、将来の[Riebeckite](https://github.com/Rerurate514/riebeckite)との
ローカル連携に向けたObsidian Community Pluginの基盤です。現時点では設定タブと
**Open settings** コマンドを登録します。サーバーへの接続、ノートの公開、Vaultデータの
変更は行いません。

English: [README.md](./README.md)

## 開発状況

プラグインの初期基盤は実装済みです。ローカルサーバー通信とRiebeckiteの各機能は、意図的に
未実装です。

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
3. **Local server URL** を変更し、設定タブを開き直して値が保存されることを確認します。
4. ローカル連携が未接続である旨が表示されることを確認します。
5. プラグインを無効化・再有効化し、コマンドが重複登録されないことを確認します。

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
