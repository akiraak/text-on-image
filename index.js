#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { program } = require('commander');

// ===== 設定定数 (デフォルト値) =====
const CONSTANTS = {
    // 解像度
    WIDTH: 1920,
    HEIGHT: 1080,
    
    // フォント
    FONT_PATH: "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",

    // ヘッダー
    HEADER: {
        SIZE: 120,
        FILL: "#111111",
        STROKE: "#cccccc",
        STROKE_WIDTH: 20,
        POS: "-520+172" // North基準
    },
    // タイトル
    TITLE: {
        SIZE: 180,
        FILL: "#ffb347",
        STROKE: "#40210f",
        STROKE_WIDTH: 26,
        POS_X: -520,
        POS_Y: 320, // North基準
        LINE_SPACING: -30
    },
    // サムネイルキャプション
    THUMB_CAPTION: {
        SIZE: 80,
        FILL: "#000000",
        STROKE: "#cccccc",
        STROKE_WIDTH: 20,
        POS: "-520+1888" // North基準 (下部)
    },
    // 埋め込み画像 (Thumb)
    EMBED: {
        WIDTH: 720,
        HEIGHT: 405,
        POS_X: -260,
        POS_Y: 538
    }
};

/**
 * コマンド実行ヘルパー
 */
function runCommand(commandStr) {
    return new Promise((resolve, reject) => {
        console.log(`[RUN] ${commandStr}`);
        const proc = spawn(commandStr, { shell: true, stdio: 'inherit' });

        proc.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Command failed with exit code ${code}`));
        });
        
        proc.on('error', (err) => reject(err));
    });
}

/**
 * 座標文字列作成
 */
function formatTitlePos(offsetX, offsetYBase, userOffsetY) {
    const x = offsetX;
    const y = offsetYBase + userOffsetY;
    const signX = x >= 0 ? '+' : '';
    const signY = y >= 0 ? '+' : '';
    return `${signX}${x}${signY}${y}`;
}

/**
 * メイン処理
 */
async function createTextImage(options, outputPath) {
    try {
        console.log(`\n🎨 画像生成プロセス開始`);
        console.log(`   背景: ${options.image}`);

        // フォントチェック
        let fontOption = "";
        if (fs.existsSync(CONSTANTS.FONT_PATH)) {
            fontOption = `-font "${CONSTANTS.FONT_PATH}"`;
        } else {
            console.warn(`⚠️  警告: フォントが見つかりません (${CONSTANTS.FONT_PATH})。システム標準フォントを使用します。`);
        }

        // === Step 1: テキストの合成 ===
        let cmdParts = [
            `convert "${options.image}"`,
            `-gravity North`
        ];

        // 1. ヘッダー
        if (options.header) {
            // オプション指定があれば優先、なければデフォルト
            const size = options.headerSize || CONSTANTS.HEADER.SIZE;
            const fill = options.headerColor || CONSTANTS.HEADER.FILL;

            cmdParts.push(
                fontOption,
                `-pointsize ${size}`,
                `-fill "${fill}"`,
                `-stroke "${CONSTANTS.HEADER.STROKE}"`,
                `-strokewidth ${CONSTANTS.HEADER.STROKE_WIDTH}`,
                `-annotate ${CONSTANTS.HEADER.POS} "${options.header}"`,
                `-strokewidth 0`,
                `-annotate ${CONSTANTS.HEADER.POS} "${options.header}"`
            );
        }

        // 2. タイトル
        if (options.title) {
            const size = options.titleSize || CONSTANTS.TITLE.SIZE;
            const fill = options.titleColor || CONSTANTS.TITLE.FILL;
            const titlePos = formatTitlePos(CONSTANTS.TITLE.POS_X, CONSTANTS.TITLE.POS_Y, parseInt(options.titleOffsetY));
            
            cmdParts.push(
                fontOption,
                `-pointsize ${size}`,
                `-fill "${fill}"`,
                `-stroke "${CONSTANTS.TITLE.STROKE}"`,
                `-strokewidth ${CONSTANTS.TITLE.STROKE_WIDTH}`,
                `-interline-spacing ${CONSTANTS.TITLE.LINE_SPACING}`,
                `-annotate ${titlePos} "${options.title}"`,
                `-strokewidth 0`,
                `-annotate ${titlePos} "${options.title}"`
            );
        }

        // 3. サムネイルキャプション
        if (options.thumbCaption) {
            const size = options.captionSize || CONSTANTS.THUMB_CAPTION.SIZE;
            const fill = options.captionColor || CONSTANTS.THUMB_CAPTION.FILL;
            const capConst = CONSTANTS.THUMB_CAPTION;

            cmdParts.push(
                fontOption,
                `-pointsize ${size}`,
                `-fill "${fill}"`,
                `-stroke "${capConst.STROKE}"`,
                `-strokewidth ${capConst.STROKE_WIDTH}`,
                `-annotate ${capConst.POS} "${options.thumbCaption}"`,
                `-strokewidth 0`,
                `-annotate ${capConst.POS} "${options.thumbCaption}"`
            );
        }

        // 解像度統一と保存
        cmdParts.push(
            `-filter Lanczos`,
            `-resize ${CONSTANTS.WIDTH}x${CONSTANTS.HEIGHT}`,
            `"${outputPath}"`
        );

        await runCommand(cmdParts.join(' '));


        // === Step 2: 埋め込み画像の合成 ===
        if (options.embedThumb) {
            if (fs.existsSync(options.embedThumb)) {
                console.log(`\n🖼️  画像を埋め込み中: ${options.embedThumb}`);
                
                const thumbCmd = `convert "${outputPath}" \
                    \\( "${options.embedThumb}" -filter Lanczos -resize ${CONSTANTS.EMBED.WIDTH}x${CONSTANTS.EMBED.HEIGHT} \\) \
                    -gravity North \
                    -geometry ${CONSTANTS.EMBED.POS_X >= 0 ? '+' : ''}${CONSTANTS.EMBED.POS_X}+${CONSTANTS.EMBED.POS_Y} \
                    -compose over -composite \
                    "${outputPath}"`;

                await runCommand(thumbCmd);
            } else {
                console.warn(`⚠️  埋め込み画像が見つかりません: ${options.embedThumb}`);
            }
        }

        console.log(`\n✅ 生成完了: ${outputPath}\n`);

    } catch (error) {
        console.error(`\n❌ エラー: ${error.message}\n`);
        process.exit(1);
    }
}

// === CLI設定 ===
program
  .name('text-on-image')
  .description('画像ファイルにテキストをレイアウトして保存するツール')
  .requiredOption('-i, --image <path>', '背景画像のファイルパス')
  
  // --- テキスト内容 ---
  .option('-t, --title <string>', 'メインタイトル (中央)')
  .option('--header <string>', 'ヘッダーテキスト (上部)')
  .option('--thumb-caption <string>', 'キャプションテキスト (下部)')
  
  // --- 色とサイズのカスタマイズ ---
  // ヘッダー
  .option('--header-size <number>', 'ヘッダーの文字サイズ', CONSTANTS.HEADER.SIZE)
  .option('--header-color <string>', 'ヘッダーの文字色', CONSTANTS.HEADER.FILL)
  
  // タイトル
  .option('--title-size <number>', 'タイトルの文字サイズ', CONSTANTS.TITLE.SIZE)
  .option('--title-color <string>', 'タイトルの文字色', CONSTANTS.TITLE.FILL)
  .option('--title-offset-y <number>', 'タイトルの上下位置調整', 0)

  // キャプション
  .option('--caption-size <number>', 'キャプションの文字サイズ', CONSTANTS.THUMB_CAPTION.SIZE)
  .option('--caption-color <string>', 'キャプションの文字色', CONSTANTS.THUMB_CAPTION.FILL)

  // --- その他 ---
  .option('--embed-thumb <path>', '右側に埋め込む画像のパス')
  .option('-o, --output <path>', '出力ファイル名', 'output.png');

program.parse(process.argv);
const opts = program.opts();

const finalOutput = opts.output || 'output.png';

// 警告
if (!opts.title && !opts.header && !opts.thumbCaption && !opts.embedThumb) {
    console.warn("⚠️  テキストや埋め込み画像が指定されていません。背景のリサイズのみ行われます。");
}

createTextImage(opts, finalOutput);