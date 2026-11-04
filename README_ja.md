# Obsidian向け Riebeckite

Riebeckiteは、ローカルの[Riebeckite](https://github.com/Rerurate514/riebeckite)
開発サーバーへObsidianを接続します。Bridgeのデータを読み取り、明示的に確認しサーバー側で承認された
フロントマター編集だけを実行できます。

English: [README.md](./README.md)

## 開発状況

Bridge Protocol v1による状態取得、解決済みページ状態、Live Previewサイドペイン、Publication
Manager、Document Diagnosticsを実装済みです。接続プロファイルは統合コンテンツルートと別管理の
コンテンツルートのマッピングに対応します。Previewは実際のローカルHonoX開発ページを表示し、
Obsidian側でMarkdownを変換しません。Bridge revisionが変化すると公開情報を更新します。プラグインの
読み込み直後から状態確認を開始し、5秒ごとに確認します。一時的な接続失敗時は5秒、10秒、20秒、40秒、
以降は最大60秒で再試行し、接続に成功すると5秒に戻ります。ペアリング拒否時は自動再試行しません。
revision更新ではプラグインのViewだけを更新するため、編集中のエディタ本文・カーソル・選択は変更せず、
Mutationも自動適用しません。Publication ManagerはBridgeが返すSEOのtitle、description、canonical URL、indexable、issuesも
表示します。

## 管理された開発（Desktop）

**Riebeckite: Open** を実行し、プロファイルを選び、**Site project directory** を設定してから
**Start Dev** を選びます。プラグインが実行するのは、そのプロジェクトにあるローカルの
`node_modules/.bin/riebeckite` の `dev` だけで、npm scriptは実行しません。初回の起動時には確認を求めます。

管理されたプロセスには、読み取り専用Bridge用の一時的なペアリングトークンを環境変数で渡します。
トークンは保存せず、コマンドライン引数・URL・プラグインログにも出力しません。同じユーザーで動く
プロセスは互いの環境変数を参照できるため、問題になる場合はローカル開発用の専用アカウントを使ってください。
Start DevでMutation権限が付与されることはありません。

StopとRestartは、このプラグインが起動したプロセスだけ（WindowsではそのPIDツリー）を対象にします。
Site project directoryはIntegrated・Separate・CustomのVaultマッピングとは独立しています。タブでは
アクティブノートのPreview、Publication、Diagnostics、Build Impact、SEOを確認できます。

## 外部 Riebeckite サーバーへの接続

1. 32文字以上の一意なペアリングトークンを指定してサイトを起動します。
   `riebeckite dev --bridge-token <token>`
2. **Riebeckite** の設定で接続プロファイルを追加または選択し、ローカルサーバーURLと同じトークンを入力します。
3. **Test connection** を選び、現在の入力値で接続を確認します。テスト結果は保存されず、成功時は
   サイト名と短縮したsite ID、失敗時は到達不可・ペアリング拒否・プロトコル非対応・loopback制約違反を表示します。
4. **Connect** を選ぶか、**Riebeckite: Connect to Riebeckite** を実行します。
5. **Riebeckite: Open Live Preview** を実行します。アクティブなMarkdownノートに追従し、必要に
   応じてRefreshまたはOpen Current Preview in Browserを使います。
6. **Riebeckite: Open Publication Manager** を実行するとアクティブノートを確認できます。Vault全体を
   取得する場合だけ **Refresh vault** を選びます。フィルタと検索は取得済みのローカル結果だけを対象とし、
   キー入力ごとにBridgeへ問い合わせません。
7. **Riebeckite: Open Document Diagnostics** を実行するとアクティブノートの診断を確認できます。
   成功した空配列だけを「問題なし」と表示し、サーバーから取得できない状態とは区別します。
8. 公開用フロントマターを編集するには、アクティブプロファイルに別の **Bridge mutation token** を設定します。
    Publication ManagerでPlanを作成・確認し、サーバー側の承認フローで承認した後に **Apply approved plan** を選びます。
     ObsidianはPlanを承認せず、承認用secretも受け取りません。
   Build Impactでは、変更・未変更・削除された各出力について、生成元、理由、依存コンテンツを確認できます。
   Mutationが競合した場合はPlanを作り直し、承認の有効期限が切れた場合はPlanを作り直して再承認を得てください。
   対象がない場合は再読み込みしてください。Obsidianが自動で再試行・再計画・承認することはありません。

integratedプロファイルで必要なのはサーバーURLとペアリングトークンだけです。separate local / Gitでは
Vaultフォルダとコンテンツルートも設定します。custom mappingでは複数のフォルダとコンテンツルートの対応を
設定できます。存在しないVaultフォルダと重複したマッピングは設定画面に表示しますが、保存は妨げません。
保存済みのsite IDと接続先Bridgeのidentityが異なる場合は別のサイトへ接続している可能性を警告し、保存済みの
site IDは変更しません。identityを返さない旧Bridgeも利用できます。

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
2. プラグインを有効化し、**Riebeckite: Open settings** を実行して設定タブが開くことを確認します。
3. アクティブプロファイルの **Riebeckite Server URL** と **Bridge pairing token** を入力し、設定タブを
   開き直して両方の値が保存されることを確認します。**Test connection** を選び、site identityの結果も確認します。
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
サーバーの`visibility`、routing、discovery、public location、理由、revision、SEO情報をそのまま使用し、
ファイル名からURLを推測したりSEOを計算したりしません。

有効な1始まりの位置情報を持つ診断は、エディタにマーカーを表示し、その位置でVault内と確認できたファイルを
開きます。マーカーにはホバー時に重要度とメッセージを表示し、診断内容が変わると再構築します。列位置は書記素
単位で行末までにクランプします。診断一覧は更新ごとにDOMを置き換え、新しい更新またはViewの破棄後に届いた
応答は反映しません。PreviewとPublication Managerも、新しい要求の後またはViewの破棄後に届いた応答を
破棄します。装飾の構築は位置のソート1回を除き線形で、10,000件の診断で検証しています。ただし、
非常に大きな結果セットでは診断ごとに1つの操作要素を描画します。プラグインは起動直後から5秒ごとに
Bridge状態を確認し、revisionが変わるとViewを更新します。一時的な失敗時は5〜60秒の指数バックオフで
再試行し、接続に成功すると5秒に戻ります。ペアリング拒否時は自動再試行しません。これらの更新は
エディタの入力・カーソル・選択を変更せず、Mutationも自動適用しません。Vault全体の取得は4 workerで
行い、最初の100ノートずつを表示します。Safe MutationはvisibilityとpublishAtのフロントマター編集だけに
限定し、2種類のBridge tokenと短時間だけ有効な独立したサーバー側承認を必須にします。リリース前には
実際のObsidianでE2E検証が必要です。

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
