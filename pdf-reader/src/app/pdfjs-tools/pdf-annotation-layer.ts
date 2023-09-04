import { getPageEl, htmlToElements } from './annotator-utils';
import { PdfRegistry } from './pdf-registry';

export class PdfAnnotationLayer {
  private registry: PdfRegistry;

  constructor({ registry }) {
    this.registry = registry;

    this.registry.register('annotation-layer', this);

    this._attachStylesheet();
  }

  private _getDocumentEl() { return this.registry.getDocumentEl(); }

  getOrAttachLayerEl(pageNum: number) {
    const pageEl = getPageEl(this._getDocumentEl(), pageNum);
    if (!pageEl.querySelector('.pdfjs-annotations'))
      pageEl.appendChild(htmlToElements(`<div class="pdfjs-annotations"></div>`));
    return pageEl.querySelector('.pdfjs-annotations');
  }

  private _attachStylesheet() {
    const styles =
      `<style>
        .pdfjs-annotations {
          position: absolute;
          left: 0;
          top: 0;
          right: 0;
          bottom: 0;
          line-height: 1;
          overflow: hidden;
          pointer-events: none;
          text-size-adjust: none;
          forced-color-adjust: none;
          transform-origin: center center;
          z-index: 5;
        }
      </style>`;
    this.registry.getDocumentEl().querySelector('head').appendChild(htmlToElements(styles));
  }
}