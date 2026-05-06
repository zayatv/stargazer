import type { InspectTarget, InspectRect } from './inspect.types.ts';
import { THEME } from '../photo/photo.theme.ts';

export function imageInspectTarget(image: HTMLImageElement): InspectTarget {
  const aspect = image.complete && image.naturalWidth > 0 ? image.naturalWidth / image.naturalHeight : 0.8;

  return {
    aspect,
    draw(ctx: CanvasRenderingContext2D, rect: InspectRect): void {
      ctx.save();

      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 32;
      ctx.shadowOffsetY = 12;
      ctx.fillStyle = '#000';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

      ctx.restore();

      if (image.complete && image.naturalWidth > 0) {
        ctx.drawImage(image, rect.x, rect.y, rect.w, rect.h);
      }
    },
  };
}

const NOTE_PAPER_FILL = '#fcefa9';
const NOTE_PAPER_EDGE = '#d8c468';
const NOTE_RULE = 'rgba(80,72,40,0.32)';
const NOTE_INK = 'rgba(60,46,32,0.95)';
const NOTE_RULE_LINE_HEIGHT = 28;
const NOTE_PADDING_TOP = 56;
const NOTE_PADDING_BOTTOM = 28;
const NOTE_PADDING_LEFT = 50;
const NOTE_PADDING_RIGHT = 22;
const NOTE_FONT_SIZE = 19;

export function noteInspectTarget(text: string): InspectTarget {
  return {
    aspect: 4 / 3,
    draw(ctx: CanvasRenderingContext2D, rect: InspectRect): void {
      ctx.save();

      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 28;
      ctx.shadowOffsetY = 12;
      ctx.fillStyle = NOTE_PAPER_FILL;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

      ctx.restore();

      ctx.strokeStyle = NOTE_PAPER_EDGE;
      ctx.lineWidth = 1;
      ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);

      ctx.strokeStyle = 'rgba(180,60,60,0.32)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rect.x + 38, rect.y + 16);
      ctx.lineTo(rect.x + 38, rect.y + rect.h - 16);
      ctx.stroke();

      ctx.strokeStyle = NOTE_RULE;
      ctx.lineWidth = 0.8;

      const ruleStartY = rect.y + NOTE_PADDING_TOP;
      const ruleEndY = rect.y + rect.h - NOTE_PADDING_BOTTOM;

      for (let ly = ruleStartY; ly < ruleEndY; ly += NOTE_RULE_LINE_HEIGHT) {
        ctx.beginPath();
        ctx.moveTo(rect.x + 18, ly);
        ctx.lineTo(rect.x + rect.w - 18, ly);
        ctx.stroke();
      }

      const tapeW = 80;
      const tapeH = 18;
      const tapeX = rect.x + rect.w * 0.5 - tapeW * 0.5;
      const tapeY = rect.y - tapeH * 0.55;

      ctx.fillStyle = 'rgba(232,201,138,0.55)';
      ctx.fillRect(tapeX, tapeY, tapeW, tapeH);

      ctx.fillStyle = NOTE_INK;
      ctx.font = `${NOTE_FONT_SIZE}px ${THEME.fontSerif}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

      const bodyX = rect.x + NOTE_PADDING_LEFT;
      const bodyMaxW = rect.w - NOTE_PADDING_LEFT - NOTE_PADDING_RIGHT;
      const lines = wrapTextToLines(ctx, text || '(no note)', bodyMaxW);

      let by = ruleStartY;

      for (const line of lines) {
        if (by > ruleEndY) break;

        ctx.fillText(line, bodyX, by);

        by += NOTE_RULE_LINE_HEIGHT;
      }
    },
  };
}

function wrapTextToLines(ctx: CanvasRenderingContext2D, text: string, maxW: number,): string[] {
  const out: string[] = [];
  const paragraphs = text.split(/\n+/);

  for (const para of paragraphs) {
    if (para.length === 0) {
      out.push('');

      continue;
    }

    const words = para.split(/\s+/).filter(Boolean);

    let line = '';

    for (const w of words) {
      const tentative = line.length === 0 ? w : line + ' ' + w;

      if (ctx.measureText(tentative).width > maxW && line.length > 0) {
        out.push(line);

        line = w;
      } else {
        line = tentative;
      }
    }

    if (line.length > 0) out.push(line);
  }
  return out;
}
