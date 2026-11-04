# Obsidian向け Riebeckite

Riebeckiteは、ローカルの[Riebeckite](https://github.com/Rerurate514/riebeckite)
開発サーバーへObsidianを接続します。Bridgeのデータを読み取り、明示的に確認しサーバー側で承認された
フロントマター編集だけを実行できます。

English: [README.md](./README.md)

## 開発状況

Bridge Protocol v1による状態取得、解決済みページ状態、Live Previewサイドペイン、Publication
Manager、Document Diagnosticsを実装済みです。接続プロファイルは統合コンテンツルートと別管理の
コンテンツルートのマッピングに対応します。Previewは実際のローカルHonoX開発ページを表示し、
Obsidian側でMarkdownを変換しません。Bridge revisionが変化すると公開情報を更新します。

## Riebeckiteへの接続

1. 32文字以上の一意なペアリングトークンを指定してサイトを起動します。
   `riebeckite dev --bridge-token <token>`
2. **Riebeckite** の設定でローカルサーバーURLと同じトークンを入力します。
3. **Connect** を選ぶか、**Riebeckite: Connect to Riebeckite** を実行します。
4. **Riebeckite: Open Live Preview** を実行します。アクティブなMarkdownノートに追従し、必要に
   応じてRefreshまたはOpen Current Preview in Browserを使います。
5. **Riebeckite: Open Publication Manager** を実行するとアクティブノートを確認できます。Vault全体を
   取得する場合だけ **Refresh vault** を選びます。フィルタと検索は取得済みのローカル結果だけを対象とし、
   キー入力ごとにBridgeへ問い合わせません。
6. **Riebeckite: Open Document Diagnostics** を実行するとアクティブノートの診断を確認できます。
    成功した空配列だけを「問題なし」と表示し、サーバーから取得できない状態とは区別します。
7. 公開用フロントマターを編集するには、アクティブプロファイルに別の **Bridge mutation token** を設定します。
   Publication ManagerでPlanを作成・確認し、サーバー側の承認フローで承認した後に **Apply approved plan** を選びます。
   ObsidianはPlanを承認せず、承認用secretも受け取りません。

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
4. **Connect** を選びMarkdownノートを開いてから、**Riebeckite: Open Live Preview** を実行します。
   実際の開発ページ、Preview URL、公開状態、`site.baseUrl`設定時の公開URLが表示されることを確認します。
5. **Disconnect** を選んだ後にプラグインを無効化・再有効化し、コマンドが重複登録されないことを確認します。
6. `publication` と `diagnostics` capabilityを通知するサーバーでは両Viewを開き、Public、Draft、
   Scheduled、Unlistedの値がRiebeckiteと一致することを確認します。非routableノートには開発プレビューを
    開く操作がないこと、フィルタ・検索で追加通信しないこと、診断が有効な位置をエディタに表示し、
    Vault内のファイルだけを開くことも確認します。

## Bridge capabilityと制約

Publication Managerには任意capabilityの`publication`、Diagnostics Viewには`diagnostics`が必要です。
これらを通知しない旧Bridge v1とも互換であり、該当Viewにはサーバー側未対応と表示します。公開状態は
サーバーの`visibility`、routing、discovery、public location、理由、revisionをそのまま使用し、
ファイル名からURLを推測しません。

有効な1始まりの位置情報を持つ診断は、エディタにマーカーを表示し、その位置でVault内と確認できたファイルを
開きます。接続中は5秒ごとにBridge状態を確認し、revisionが変わるとViewを更新します。Vault全体の取得は
4 workerで行い、最初の100ノートずつを表示します。Safe MutationはvisibilityとpublishAtのフロントマター
編集だけに限定し、2種類のBridge tokenと短時間だけ有効な独立したサーバー側承認を必須にします。
リリース前には実際のObsidianでE2E検証が必要です。

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
