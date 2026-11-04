# Obsidian向け Riebeckite

Riebeckiteは、選択した1つのサイトプロジェクトのローカル
[Riebeckite](https://github.com/Rerurate514/riebeckite) 開発サーバーを管理します。
任意のサーバーへ接続するのではなく、その管理プロセスのBridgeデータを読み取ります。

English: [README.md](./README.md)

## 開発状況

Bridge Protocol v1による状態取得、解決済みページ状態、Live Previewサイドペイン、Publication
Manager、Document Diagnosticsを提供します。Previewは実際のローカルHonoX開発ページを表示し、
Obsidian側でMarkdownを変換しません。設定ではサイトを一度選択し、標準ではVault全体を対応付けます。
必要に応じてVaultフォルダに限定でき、管理開発への接続時にidentityを照合します。revision更新では
プラグインのViewだけを更新し、編集中のエディタ本文・カーソル・選択・ファイルは変更しません。

## 管理された開発（Desktop）

**Riebeckite: Open** を実行し、設定で **Site project** を選んでから **Start Dev** を選びます。
デスクトップではフォルダ選択ダイアログを開き、利用できない場合だけテキスト入力へ戻ります。ローカルの
Riebeckite CLIと設定があるプロジェクトだけを受け付け、
`node_modules/@riebeckite/cli/bin/riebeckite.mjs` の `dev` を実行します。npm scriptは実行しません。
初回の起動時には確認を求めます。

プラグインとCLIは、継承した非公開ファイル記述子上のバージョン付きJSONL制御チャネルを使います。
CLIはloopbackのBridge bootstrap endpointを確認できてからだけ `ready` を通知します。管理プロセスには
一時的なBridgeトークンを環境変数で渡します。トークンは保存せず、コマンドライン引数・URL・
プラグインログにも出力しません。同じユーザーで動くプロセスは互いの環境変数を参照できるため、問題に
なる場合はローカル開発用の専用アカウントを使ってください。Start DevでMutation権限は付与されません。

StopとRestartは、このプラグインが起動したプロセスだけ（WindowsではそのPIDツリー）を対象にします。
タブではアクティブノートのPreview、Publication、Diagnostics、Build Impact、SEOを確認できます。
Safe Mutationはサーバー側で保護されたままですが、この管理連携はMutation用の認証情報を渡さず、
ファイルも書き換えません。

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

### パフォーマンス

`pnpm test` には性能チェックが含まれます。Node.js 24.22.1、Windows 10.0.26200、
AMD Ryzen 7 7730Uでの実測値です。

| 処理 | 1,000件 | 5,000件 | 10,000件 |
| --- | --- | --- | --- |
| 診断位置の計算 | 0.5 ms | 1.7 ms | 4.0 ms |
| 診断装飾の構築 | 0.7 ms | 2.4 ms | 6.3 ms |
| 公開一覧のフィルタ | 0.06 ms | 0.22 ms | 0.37 ms |

同じ環境で10,000件の診断を12回更新しても、ヒープの下限は約18 MiBのままでした。
測定対象は位置計算・装飾構築・一覧のフィルタで、ObsidianのDOM描画は含みません。
値は環境で変わるため、`pnpm test`で再現してください。

## Obsidianでの手動検証

1. 上記の手順でテスト用Vaultへビルド成果物を導入します。
2. プラグインを有効化し、**Riebeckite: Open settings** を実行して互換性のあるサイトプロジェクトを選びます。
   URL、トークン、接続モード、Connectボタンが表示も保存もされないことを確認します。
3. **Start Dev** を選び、Markdownノートを開いてから **Riebeckite: Open Live Preview** を実行します。
   実際の開発ページ、Preview URL、公開状態、`site.baseUrl`設定時の公開URLが表示されることを確認します。
4. **Restart Dev** を選び、プラグインを無効化・再有効化します。コマンドが重複登録されず、
   unload時にプロセスが停止することを確認します。
6. `publication` と `diagnostics` capabilityを通知するサーバーでは両Viewを開き、Public、Draft、
   Scheduled、Unlistedの値がRiebeckiteと一致することを確認します。非routableノートには開発プレビューを
   開く操作がないこと、フィルタ・検索で追加通信しないこと、診断が有効な位置をエディタに表示し、
   Vault内のファイルだけを開くことも確認します。

## Bridge capabilityと制約

Publication Managerには任意capabilityの`publication`、Diagnostics Viewには`diagnostics`が必要です。
公開状態はサーバーの`visibility`、routing、discovery、public location、理由、revision、SEO情報を
そのまま使用し、ファイル名からURLを推測したりSEOを計算したりしません。

有効な1始まりの位置情報を持つ診断は、エディタにマーカーを表示し、その位置でVault内と確認できたファイルを
開きます。マーカーにはホバー時に重要度とメッセージを表示し、診断内容が変わると再構築します。列位置は書記素
単位で行末までにクランプします。診断一覧は更新ごとにDOMを置き換え、新しい更新またはViewの破棄後に届いた
応答は反映しません。PreviewとPublication Managerも、新しい要求の後またはViewの破棄後に届いた応答を
破棄します。装飾の構築は位置のソート1回を除き線形で、10,000件の診断で検証しています。ただし、
非常に大きな結果セットでは診断ごとに1つの操作要素を描画します。Bridge状態の確認は管理開発へ接続してから
開始し、revisionが変わるとViewを更新します。これらの更新はエディタの入力・カーソル・選択・ファイルを
変更しません。Vault全体の取得は4 workerで行い、最初の100ノートずつを表示します。Safe Mutationは
Bridge認証情報と短時間だけ有効な独立したサーバー側承認により保護されたままですが、この連携では利用できません。
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
