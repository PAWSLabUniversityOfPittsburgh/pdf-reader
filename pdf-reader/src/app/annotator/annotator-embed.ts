import { Annotator } from './annotator';
import { AnnotatorPopup } from './annotator-popup';
import { AnnotationStore } from './annotator-store';
import {
  Rect,
  closestPageEl, createUniqueId, getPageEl, getPageNum,
  htmlToElements, isRightClick, relativeToPageEl, rotateRect, rotation, scale
} from './utils';

export type EmbedAnnotation = {
  id: string,
  type: string,
  page: number,
  bound: Rect,
  link: string,
  target: string,
}

export class EmbedAnnotator {
  private window;
  private document;
  private documentEl;

  private pdfjs;
  private annotator: Annotator;
  private store: AnnotationStore;
  private popup: AnnotatorPopup;

  constructor({ iframe, pdfjs, annotator, store, popup }) {
    this.window = iframe?.contentWindow;
    this.document = iframe?.contentDocument;
    this.documentEl = this.document.documentElement;

    this.pdfjs = pdfjs;
    this.annotator = annotator;
    this.store = store;
    this.popup = popup;

    this.annotator.registerBoundGetter('pdfjs-annotation__embed',
      (pageNum: number, annot: any) => annot.bound);

    this._attachStylesheet();
    this._enableMoveOnDrag();
    this._renderOnPagerendered();
    this._registerToggleItemUI();
    this._registerEditorItemUI();
  }

  private _attachStylesheet() {
    this.documentEl.querySelector('head').appendChild(htmlToElements(
      `<link rel="stylesheet" type="text/css" href="/assets/annotator-embed.css" />`
    ));
  }

  private _registerToggleItemUI() {
    this.popup.registerItemUI(($event: any) => {
      if (!isRightClick($event))
        return null as any;

      $event.preventDefault();
      const containerEl = htmlToElements(`<div style="display: flex; gap: 5px;"></div>`);
      const buttonEl = htmlToElements(`<button style="flex-grow: 1;">embed link</button>`);
      containerEl.appendChild(buttonEl);
      buttonEl.onclick = ($ev) => {
        const pageEl = closestPageEl($event.target);;
        const pageNum = getPageNum(pageEl);
        const { top, left, right, bottom } = relativeToPageEl({
          top: $event.y,
          left: $event.x,
          bottom: $event.y + 24,
          right: $event.x + 24,
          width: 24, height: 24
        } as any, pageEl);
        const annot = {
          id: createUniqueId(),
          type: 'embed',
          bound: { top, left, right, bottom },
          page: pageNum,
          link: '',
          target: 'popup-iframe',
        };
        this.store.create(annot);
        this.render(annot);
        this.popup.hide();
      }

      return containerEl;
    });
  }

  private _registerEditorItemUI() {
    this.popup.registerItemUI(($event: any) => {
      const embedEl = $event.target.classList.contains('pdfjs-annotation__embed')
        ? $event.target : $event.target.closest('.pdfjs-annotation__embed');

      if (embedEl) {
        const annot = this.store.read(embedEl.getAttribute('data-annotation-id'));
        const embedElStyle = getComputedStyle(embedEl);
        const scaledHeight = 24 * scale(this.pdfjs);
        this.popup.location = {
          top: `calc(${embedElStyle.top} + ${scaledHeight + 2}px)`,
          left: `${embedElStyle.left}`,
        };

        const containerEl = htmlToElements(`<div style="display: flex; flex-flow: column;"></div>`);

        const linkInputEl = htmlToElements(
          `<input type="text" placeholder="put resource url" style="margin-bottom: 5px;" value="${annot.link}"/>`);
        containerEl.appendChild(linkInputEl);
        linkInputEl.onchange = ($ev: any) => {
          annot.link = (linkInputEl as any).value;
          this.store.update(annot);
        };

        const onRadioClick = (el: any, target: string) => {
          el.querySelector('input').onclick = ($ev) => {
            annot.target = target;
            this.store.update(annot);
          }
        }

        const random = Math.random();
        const popupOptionEl = htmlToElements(
          `<div>
            <input type="radio" name="popup" id="popup-${random}" ${annot.target == 'popup-iframe' ? 'checked' : ''}/>
            <label for="popup-${random}">Open in popup</label>
          </div>`);
        containerEl.appendChild(popupOptionEl);
        onRadioClick(popupOptionEl, 'popup-iframe');

        const pageOptionEl = htmlToElements(
          `<div>
            <input type="radio" name="popup" id="page-${random}" ${annot.target == 'page' ? 'checked' : ''}/>
            <label for="page-${random}">Open in new page</label>
          </div>`);
        onRadioClick(pageOptionEl, 'page');
        containerEl.appendChild(pageOptionEl);

        return containerEl;
      }

      return null as any;
    });
  }

  private _enableMoveOnDrag() {
    let lastBound;
    let embedEl: HTMLElement;
    this.documentEl.addEventListener("mousedown", ($event: any) => {
      if ($event.target.classList.contains('pdfjs-annotation__embed'))
        embedEl = $event.target;
      else if ($event.target.parentNode.classList.contains('pdfjs-annotation__embed'))
        embedEl = $event.target.parentNode;
    });

    this.documentEl.addEventListener("mousemove", ($event: any) => {
      if (embedEl) {
        const scaleFactor = 12 * scale(this.pdfjs);
        const pageEl = closestPageEl(embedEl);
        lastBound = relativeToPageEl({
          top: $event.y - scaleFactor,
          left: $event.x - scaleFactor,
          bottom: $event.y + scaleFactor,
          right: $event.x + scaleFactor,
          width: 2 * scaleFactor,
          height: 2 * scaleFactor
        } as any, pageEl);

        embedEl.style.top = `${lastBound.top}%`;
        embedEl.style.left = `${lastBound.left}%`;
        embedEl.style.right = `${lastBound.right}%`;
        embedEl.style.bottom = `${lastBound.bottom}%`;
      }
    });

    this.documentEl.addEventListener("mouseup", ($event: any) => {
      if (embedEl && lastBound) {
        const annotId = embedEl.getAttribute('data-annotation-id') as string;
        const annot = this.store.read(annotId);
        annot.bound = lastBound;
        this.store.update(annot);
      }
      embedEl = null as any;
    });
  }

  private _renderOnPagerendered() {
    this.pdfjs.eventBus.on('pagerendered', ($event: any) => {
      const pageNum = $event.pageNumber;
      const annotsLayerEl = this.annotator.getOrAttachAnnotLayerEl(pageNum);
      annotsLayerEl.querySelectorAll('.pdfjs-annotation__embed').forEach((el: any) => el.remove());

      (this.store.list() as EmbedAnnotation[])
        .filter(annot => annot.type == 'embed')
        .filter(annot => annot.page == pageNum)
        .forEach(annot => this.render(annot));
    });
  }

  render(annot: EmbedAnnotation) {
    const annotsLayerEl = this.annotator.getOrAttachAnnotLayerEl(annot.page);
    annotsLayerEl.querySelectorAll(`[data-annotation-id="${annot.id}"].pdfjs-annotation__embed`)
      .forEach((el: any) => el.remove());

    const degree = rotation(this.pdfjs);
    const bound = rotateRect(degree, true, annot.bound as any);
    const embedEl = htmlToElements(
      `<button data-annotation-id="${annot.id}" 
        class="pdfjs-annotation__embed"
        tabindex="-1" 
        style="
          top: ${bound.top}%;
          bottom: ${bound.bottom}%;
          left: ${bound.left}%;
          right: ${bound.right}%;
          border-radius: 100%;
        ">
      </button>`);

    annotsLayerEl.appendChild(embedEl);
  }
}