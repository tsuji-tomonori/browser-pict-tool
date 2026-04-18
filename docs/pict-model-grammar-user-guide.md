# PICT モデル文法ユーザーガイド

この文書は、`.work/pict` に含まれる公開ガイド、CLI 実装、テストケースをもとに整理した PICT モデル文法の実用ガイドである。

整理方針は次のとおり。

- 本文の「標準的な書き方」は、主に `.work/pict/doc/pict.md` に沿う
- 本文中の「repo 実装補足」は、`.work/pict/cli/*.cpp` と `.work/pict/test/*` で確認できた挙動を書く
- ブラウザ実装や互換実装を作る場合は、公開仕様と実装依存挙動を分けて扱う

## 1. 最小例

以下は、もっとも基本的な PICT モデルである。

```text
Browser: Chrome, Firefox, Safari
OS: Windows, macOS, Linux
Login: Email, SSO

IF [Browser] = "Safari" THEN [OS] <> "Linux";
```

このモデルは次を表す。

- `Browser`, `OS`, `Login` という 3 つのパラメータを定義する
- 各パラメータに取りうる値の列を与える
- `Safari` と `Linux` の同時成立を禁止する

## 2. モデル評価に影響する主な CLI オプション

PICT は次の形で使う。

```text
pict model [options]
```

モデル文法や評価方法に直接関係する主なオプションは次のとおり。

- `/o:N|max` 組み合わせ強度。既定は `2`
- `/d:C` 値区切り文字。既定は `,`
- `/a:C` alias 区切り文字。既定は `|`
- `/n:C` negative prefix。既定は `~`
- `/e:file` seeding ファイル
- `/c` パラメータ名と値の比較を case-sensitive にする
- `/f:text|json` 出力形式。既定は `text`
- `/s` 統計表示

repo 実装補足:

- `/d:space` と `/d:tab` が使える
- `/a:space` と `/a:tab` が使える
- `/r[:N]` で生成順をランダマイズできる
- `/p`, `/x[:N]`, `/v` という隠しオプションがある

## 3. モデルファイル全体の構成

標準的な構成は次の順序である。

```text
parameter definitions
[sub-model definitions]
[constraint definitions]
```

ルール:

- パラメータ定義は必須
- sub-model 定義と constraint 定義は任意
- 空行はどこに入れてもよい
- コメントは、その行の先頭の非空白文字が `#` の行だけが有効
- inline comment はない
- セクション順は守る

例:

```text
# parameters
Browser: Chrome, Firefox, Safari
OS: Windows, macOS, Linux
Locale: ja-JP, en-US

# sub-models
{ Browser, OS } @ 2

# constraints
IF [Browser] = "Safari" THEN [OS] <> "Linux";
```

repo 実装補足:

- パーサは、最初に `{...}` 形式の行を見つけた時点で sub-model セクションへ移る
- 最初に constraint らしい行を見つけた時点で constraint セクションへ移る
- constraint セクションに入った後の残り行は、parameter でも sub-model でもなく constraint 文字列として連結される
- したがって、順序違反は「別セクションとして読まれる」のではなく、後段で constraint エラーになりやすい

## 4. パラメータ定義

### 4.1 推奨する基本形

基本形は次のとおり。

```text
<ParamName>: <Value1>, <Value2>, <Value3>, ...
```

例:

```text
Type: Primary, Logical, Single, Span
Size: 10, 100, 500, 1000
Format method: Quick, Slow
```

ポイント:

- 1 行に 1 パラメータを書く
- 既定の値区切りは `,`
- パラメータ名に空白を含めてよい
- 制約から参照するときは `[ParamName]` 形式で書く

### 4.2 パラメータ名と値名の扱い

parameter セクションでは、値名は「ほぼ生の文字列」として読む。

- parameter セクションでは `"..."` は引用記法ではなく普通の文字である
- `[` や `]` もそのまま使える
- Unicode も使える
- 値区切り文字 `/d`、alias 区切り文字 `/a`、negative prefix `/n` は特別扱いされる
- 行末の `(整数)` は weight として解釈されうる
- 値トークン全体が `<ParamName>` なら parameter reuse として解釈されうる

制約セクションとは記法が異なるので注意する。

### 4.3 区切り文字

既定では値区切りは `,` である。

```text
OS: Win7, Win8, Win10
```

`/d:;` を使う場合は、モデル側もそれに合わせる。

```text
OS: Win7; Win8; Win10
```

注意:

- parameter セクションでは区切り文字のエスケープ機構はない
- 値そのものに値区切り文字を含めたいなら `/d` を変える
- alias 区切り文字を値名に含めたいなら `/a` を変える

### 4.4 型推論

PICT に明示的な型宣言はない。型は値から推論される。

- そのパラメータの全値が数値に変換できれば numeric
- 1 つでも数値に変換できない値があれば string

例:

```text
Size: 1, 2, 3, 4, 5
Mode: Basic, Advanced
```

この場合:

- `Size` は numeric
- `Mode` は string

repo 実装補足:

- alias がある場合、型判定に使われるのは先頭 alias だけ
- negative prefix は型判定前に除かれる
- `1`, `1.0`, `-10.001` のような浮動小数も numeric として扱われる

### 4.5 エイリアス

1 つの値に複数の表示名を持たせるには alias を使う。

```text
SKU_1: Professional, Server | Datacenter
```

意味:

- `Server | Datacenter` は 1 つの値
- 出力では各行に別名がローテーションして使われる

ルール:

- 既定の alias 区切りは `|`
- `/a:C` で変更できる
- 制約評価、型判定、negative 判定に使われるのは先頭 alias だけ

repo 実装補足:

- alias の各要素は空文字でも保持される
- したがって `A: x||y` のような空 alias も受理される
- seeding では alias 名でも値照合できるが、同名 alias があると曖昧になる

### 4.6 Negative testing

範囲外値や不正値を表すには、値の先頭に negative prefix を付ける。既定は `~`。

```text
A: ~-1, 0, 1, 2
B: ~-1, 0, 1, 2
```

性質:

- negative 値同士が同じ行に 2 つ以上入らないように生成される
- 制約では prefix を外した本体値で比較する
- 出力には prefix 付きの名前が出る

例:

```text
IF [A] = -1 THEN [B] = 0;
```

repo 実装補足:

- alias 付き値では、先頭 alias に prefix があれば値全体が negative 扱いになる
- 先頭 alias だけが判定対象なので、後続 alias に `~` が付いていても意味はない
- parameter に positive 値が 1 つもない場合はエラーになる

### 4.7 Weight

特定値を優先したい場合は weight を付ける。

```text
Type: Primary (10), Logical, Single
File system: FAT, FAT32, NTFS (10)
```

ルール:

- weight は正の整数
- 未指定時は `1`
- weight はヒントであり、出現回数の保証ではない

repo 実装補足:

- 行末の `(整数)` だけが weight として認識される
- `(0)` や負数は weight として採用されない
- malformed な `(1x)` や `()` はエラーではなく、値文字列の一部として残る場合がある
- 互換性のため、weight は必ず明確な正整数だけを書く方がよい

### 4.8 Parameter reuse

既存パラメータの値集合を再利用できる。

```text
OS_1:   Win7, Win8, Win10
SKU_1:  Home, Pro

OS_2:   <OS_1>
SKU_2:  <SKU_1>, Enterprise
```

用途:

- 同じ値集合を複数パラメータで再利用する
- モデルの重複を減らす

repo 実装補足:

- `<ParamName>` と解釈されるのは、trim 後の値トークン全体が `<...>` の形のときだけ
- 参照先は「それ以前に定義済み」のパラメータだけである
- 前方参照は失敗ではなく、単なる文字列値 `<ParamName>` として残る

### 4.9 repo 実装にある `Param @ N:` 形式

repo 実装には、parameter 名の右に order を埋め込む読み方がある。

```text
Browser @ 2: Chrome, Firefox, Safari
```

これは root model 側の parameter order として扱われる。

注意:

- 公開ガイドには出てこない
- 実装依存であり、互換対象に含めるなら独自仕様として明示した方がよい

### 4.10 repo 実装にある result parameter

parameter 名が `$` で始まると、result parameter として扱われる。

```text
$RESULT: TRUE, FALSE
```

repo 実装補足:

- result parameter は通常入力パラメータとは少し異なる扱いになる
- engine 側では order が `1` に固定される
- seeding では result parameter の値は取り込まれない
- 引数なし `IsPositive()` / `IsNegative()` の展開対象からも除外される

### 4.11 repo 実装が受理する permissive な parameter 記法

repo 実装は公開ガイドより permissive である。

- `:` がなくても、最初に現れた値区切り文字で parameter 名と値列を分ける
- 空 parameter 名を受理する
- 空 value を受理する
- tab や quote を含む parameter 名や value 名も受理する

例:

```text
,a,b,c
Browser, Chrome, Firefox, Safari
D: , aa, bb
```

補足:

- 空 parameter 名は制約側では `[]` で参照できる
- ただし、可読性と互換性のため通常は使わない方がよい

## 5. Sub-models

特定のパラメータ群に別の組み合わせ強度を与えるには sub-model を使う。

構文:

```text
{ <ParamName1>, <ParamName2>, <ParamName3>, ... } @ <Order>
```

例:

```text
PLATFORM: x86, x64, arm
CPUS: 1, 2, 4
RAM: 1GB, 4GB, 64GB
HDD: SCSI, IDE
OS: Win7, Win8, Win10
Browser: Edge, Opera, Chrome, Firefox

{ PLATFORM, CPUS, RAM, HDD } @ 2
```

ルール:

- sub-model は複数定義できる
- 1 つのパラメータが複数 sub-model に属してもよい
- 階層は 1 段だけ
- sub-model の order は、その sub-model に含まれるパラメータ数を超えられない
- `@ <Order>` を省略した場合は `/o` の値が使われる

repo 実装補足:

- sub-model の parameter 名区切りは、まずカンマ `,` で解釈される
- それで一致しなければ `/d` の値区切り文字でも再試行される
- unknown parameter を含む sub-model は warning を出して丸ごとスキップされる
- duplicate parameter は warning を出して重複除去される

## 6. 制約

制約は、生成してはいけない組み合わせを表す。

### 6.1 基本形

条件付き制約:

```text
IF <Predicate> THEN <Predicate>;
IF <Predicate> THEN <Predicate> ELSE <Predicate>;
```

無条件制約:

```text
<Predicate>;
```

例:

```text
IF [File system] = "FAT" THEN [Size] <= 4096;
IF [Network] = "Offline" THEN [Login] <> "SSO";
[OS_1] <> [OS_2] OR [SKU_1] <> [SKU_2];
```

ポイント:

- 制約は必ずセミコロン `;` で終える
- 1 つの制約は複数行にまたがってよい
- `IF` のない制約は invariant として扱われる

repo 実装補足:

- constraint 行はファイル末尾まで連結して読む
- 改行は自動で空白に置き換えられないので、トークン境界が曖昧にならない書き方にする方が安全である

### 6.2 パラメータ参照

制約の中でパラメータを参照するときは角括弧を使う。

```text
[Browser]
[File system]
[Cluster size]
```

parameter 名に `]` を含めたい場合は、constraint 側では `\]` で書ける。

```text
G]2: a, b, c

IF [G\]2] = "a" THEN ...
```

### 6.3 値リテラル

constraint 中の右辺値は次の書き方を使う。

- 文字列は `"..."` で書く
- 数値はそのまま書く

例:

```text
[Mode] = "Advanced"
[Size] >= 100
```

重要:

- unquoted string literal は使えない
- `IF [A] = Foo THEN ...` のような書き方は文法エラーになる

### 6.4 比較演算子

基本の比較演算子は次のとおり。

- `=`
- `<>`
- `>`
- `>=`
- `<`
- `<=`
- `LIKE`
- `IN`

例:

```text
[Size] < 10000
[Compression] = "Off"
[File system] LIKE "FAT*"
[Cluster size] IN {512, 1024, 2048}
```

repo 実装補足:

- `NOT LIKE`
- `NOT IN`

も受理する。

例:

```text
IF [ProjectType] NOT IN {"VB", "C#"} THEN [FileLinked] = "No";
IF [Browser] NOT LIKE "IE*" THEN [Mode] = "Modern";
```

また、

```text
NOT [Browser] LIKE "IE*"
NOT [Kind] IN {"A", "B"}
```

のように `NOT` を前置した形も受理される。

### 6.5 論理演算子と優先順位

複数条件は次で連結できる。

- `NOT`
- `AND`
- `OR`

括弧も使える。

```text
IF [File system] <> "NTFS" OR
 ( [File system] = "NTFS" AND [Cluster size] > 4096 )
THEN [Compression] = "Off";
```

実装上の優先順位は次の順で高い。

1. `NOT`
2. `AND`
3. `OR`

優先順位に依存させたくない場合は、常に括弧を使う方が安全である。

### 6.6 パラメータ同士の比較

右辺には別パラメータも置ける。

```text
IF [LANG_1] = [LANG_2]
THEN [OS_1] <> [OS_2] AND [SKU_1] <> [SKU_2];
```

### 6.7 `LIKE` のパターン

`LIKE` は文字列に対するワイルドカード比較である。

- `*` は任意長の任意文字列
- `?` は任意 1 文字

例:

```text
[File system] LIKE "FAT*"
[Name] LIKE "ab??"
```

重要:

- `LIKE` は string parameter にしか使えない
- 右辺も string literal でなければならない
- 実装上、サポートされる特殊記号は `*` と `?` だけ
- 文字クラスのような `[abc]` 記法はない

### 6.8 `IN` の値集合

複数値の集合判定には `IN` を使う。

```text
IF [Cluster size] IN {512, 1024, 2048} THEN [Compression] = "Off";
IF [File system] IN {"FAT", "FAT32"} THEN [Compression] = "Off";
```

ルール:

- 集合は `{...}` で囲む
- 要素区切りは常にカンマ `,`
- 要素は数値か quoted string
- 空集合 `IN {}` は使えない
- 1 つの集合の中で型を混在させてはいけない

### 6.9 `IsPositive` / `IsNegative`

repo 実装には、公開ガイドに前面では出てこない関数形式がある。

```text
IsPositive(E)
IsNegative(E)
IsPositive()
IsNegative()
```

意味:

- `IsPositive(E)` は parameter `E` の現在値が positive 値かを判定する
- `IsNegative(E)` は parameter `E` の現在値が negative 値かを判定する
- 引数なし `IsPositive()` は全 non-result parameter に対する AND 展開
- 引数なし `IsNegative()` は全 non-result parameter に対する OR 展開

これらの関数は `IF` 側にも `THEN` / `ELSE` 側にも書ける。

### 6.10 文字列と parameter 名のエスケープ

constraint tokenizer が受理するバックスラッシュエスケープは限定的である。

- `\\` バックスラッシュ自体
- `\"` ダブルクォート
- `\]` 閉じ角括弧

例:

```text
IF [Name] = "a\"b" THEN ...
IF [Path] = "C:\\Temp" THEN ...
IF [G\]2] = "x" THEN ...
```

注意:

- `\n`, `\t`, `\a` などは使えない
- 非対応エスケープは文法エラーになる
- 文字列中の `]` はそのまま書いてよく、`\]` は実装上は受理されるが必須ではない

### 6.11 大文字小文字

既定では、PICT は parameter 名と値の比較を case-insensitive に行う。

つまり次は同一視される。

- `OS` と `os`
- `Win10` と `win10`

`/c` を使うと parameter 名と値の比較は case-sensitive になる。

repo 実装補足:

- keyword と演算子の認識は常に case-insensitive である
- したがって `/c` を付けても `if`, `IF`, `Like`, `LIKE`, `isnegative` などはすべて受理される

### 6.12 型と semantic rule

constraint 評価では型整合性が重要である。

- numeric parameter は numeric 値と比較する
- string parameter は string 値と比較する
- `LIKE` は string parameter にしか使えない
- `LIKE` の右辺は numeric ではいけない
- parameter 同士を比較する場合、両者の型は同じでなければならない
- parameter を自分自身と比較してはいけない

例:

```text
Size: 1, 2, 3, 4, 5
Value: a, b, c, d

IF [Size] > 3 THEN [Value] > "b";
```

repo 実装補足:

- unknown parameter を含む constraint は warning を出してその constraint だけスキップされる
- 型不整合は hard error になる

### 6.13 よくある非対応・エラー例

次のような書き方は使えない。

- 文字列右辺の引用を省く
- 空の `IN {}`
- `LIKE` で numeric parameter を比較する
- `LIKE` 右辺に数値を置く
- 1 つの predicate をカンマで連結する
- inline comment を書く

たとえば次はエラーになる。

```text
IF [A] = 2 THEN [B] = 3, [C] = 3;
```

PICT の predicate 連結子は `AND` / `OR` だけであり、`,` ではない。

## 7. Seeding

seeding は、既存行や重要行を先に与え、その上に生成を積み増す機能である。

指定は CLI の `/e:file` を使う。

形式:

- 1 行目は parameter 名の tab 区切りヘッダ
- 2 行目以降は行データ
- 形式は通常出力と同じ TSV

例:

```text
Ver    SKU     Lang    Arch
Win7   Pro     EN      x86
Win7           FR      x86
Win10  Pro     EN      x64
```

ルール:

- partial row を書ける
- モデルに存在しない列は無視される
- モデルに存在しない値はそのセルだけ無視される
- 現在の制約に違反する行は丸ごとスキップされる

repo 実装補足:

- seeding の値照合では alias 名も使える
- seeding 読み込み時には negative prefix を外してから値照合する
- result parameter の列は無視される
- blank parameter 名、blank value 名、tab を含む名前、重複 alias は seeding を曖昧にするため warning 対象である
- seeding ファイルは最初の空行で読み込み終了になる

## 8. 利用者向けの推奨スタイル

通常利用では次を守ると安全である。

- parameter 定義は必ず `Param: A, B, C` 形式で書く
- parameter 名と value 名は空にしない
- 値区切りや alias 区切りを値文字列に埋め込まない
- string literal は constraint 側で必ず `"..."` で書く
- 複雑な `AND` / `OR` は括弧で明示する
- negative 値は constraint では prefix を外した本体値で書く
- alias を使う場合、constraint は先頭 alias に対して書く
- parameter reuse は必ず後方参照で書く
- public guide にない拡張は必要性があるときだけ使う

## 9. 利用者向け簡約文法

以下は、通常利用で案内しやすい簡約文法である。

```text
Model ::= ParamSection [SubModelSection] [ConstraintSection]

ParamSection ::= { Comment | Blank | ParamDef }
SubModelSection ::= { Comment | Blank | SubModelDef }
ConstraintSection ::= { Comment | Blank | Constraint }

Comment ::= "#" <text>
Blank ::= <empty line>

ParamDef ::= ParamName ":" ValueList
ValueList ::= ValueDef { ValueDelimiter ValueDef }

ValueDef ::= [NegativePrefix] PrimaryName [AliasPart] [WeightPart]
AliasPart ::= AliasDelimiter AliasName { AliasDelimiter AliasName }
WeightPart ::= "(" PositiveInteger ")"

SubModelDef ::= "{" ParamNameList "}" [ "@" Order ]
ParamNameList ::= ParamName { "," ParamName }

Constraint ::= "IF" Predicate "THEN" Predicate [ "ELSE" Predicate ] ";"
             | Predicate ";"

Predicate ::= Clause { ("AND" | "OR") Clause }
Clause ::= Term
         | "NOT" Clause
         | "(" Predicate ")"

Term ::= "[" ParamName "]" Relation ValueLiteral
       | "[" ParamName "]" Relation "[" ParamName "]"
       | "[" ParamName "]" LikeRelation StringLiteral
       | "[" ParamName "]" InRelation "{" ValueLiteralList "}"
       | FunctionCall

Relation ::= "=" | "<>" | ">" | ">=" | "<" | "<="
LikeRelation ::= "LIKE" | "NOT" "LIKE"
InRelation ::= "IN" | "NOT" "IN"

FunctionCall ::= "IsPositive(" [ParamName] ")"
               | "IsNegative(" [ParamName] ")"

ValueLiteralList ::= ValueLiteral { "," ValueLiteral }
ValueLiteral ::= Number | StringLiteral
```

注記:

- これは利用者向けの要約であり、内部実装の完全構文ではない
- 実装はこれより permissive だが、通常はその permissive さに依存しない方がよい

## 10. repo 実装から確認できる拡張・癖の一覧

公開ガイドより広く受理している、または実装依存とみなすべき点をまとめる。

- `:` なし parameter 定義を受理する
- 空 parameter 名を受理する
- 空 value や空 alias を受理する
- `Param @ N:` 形式を受理する
- `$` で始まる result parameter を持てる
- `NOT LIKE` と `NOT IN` を受理する
- `IsPositive` / `IsNegative` 関数を受理する
- 引数なし `IsPositive()` / `IsNegative()` を macro 展開する
- unknown parameter を含む constraint は warning 扱いでスキップする
- sub-model の unknown parameter は warning 扱いでスキップする
- malformed weight は hard error ではなく値文字列に残る場合がある
- parameter reuse の前方参照は失敗ではなく文字列値として残る
- seeding では alias 名でも一致できる

これらを「互換仕様」として採用するかどうかは、別途明示する方が安全である。

## 11. 調査に使った主なソース

公開ガイド:

- `.work/pict/doc/pict.md`
- `.work/pict/README.md`

実装:

- `.work/pict/cli/mparser.cpp`
- `.work/pict/cli/ctokenizer.cpp`
- `.work/pict/cli/cparser.cpp`
- `.work/pict/cli/gcdexcl.cpp`
- `.work/pict/cli/model.cpp`
- `.work/pict/cli/cmdline.cpp`

代表的な確認テスト:

- parameter: `.work/pict/test/para/para001.txt`, `para023.txt`
- constraints: `.work/pict/test/cons/cons101.txt`, `cons106.txt`, `cons350.txt`
- functions: `.work/pict/test/func/func024.txt`
- sub-model / model ordering: `.work/pict/test/modl/*`
- seeding: `.work/pict/test/seed/*`
- real-world extension use: `.work/pict/test/real/real021.txt`
