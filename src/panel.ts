/**
 * Programmatic panel builder — the second entry point, for quick experiment
 * panels. Generates the same native elements you would write by hand
 * (details/summary, label, output, input) bound with the same primitives the
 * attribute binder uses. No CSS required; the optional simpleform.css theme
 * targets .sf-panel for the polytopy look.
 *
 *   const p = panel('Training');
 *   p.slider('Learning rate', params.learningRate, { min: 0.001, max: 0.1, step: 0.001 });
 *   p.button(views.trainLabel, actions.train, { disabled: views.trainLocked });
 */
import { type Readable, type Signal, type Stop } from './signals';
import { bindDisabled, bindText, bindValue, bindWheel, listen } from './bindings';

export interface PanelOptions {
  /** Where to append the panel. Default: document.body. */
  parent?: Element;
  /** Start expanded. Default: true. */
  open?: boolean;
}

export interface SliderOptions {
  min: number;
  max: number;
  step: number;
  /** Mouse wheel nudges by step. Default: true. */
  wheel?: boolean;
  /** Formats the value readout. Default: String. */
  format?: (v: number) => string;
}

export type SelectOption = string | number | { value: string | number; label: string };

export function panel(title: string, opts: PanelOptions = {}): Panel {
  const p = new Panel(title, opts.open ?? true);
  (opts.parent ?? document.body).appendChild(p.el);
  return p;
}

export class Panel {
  readonly el: HTMLDetailsElement;
  private readonly body: HTMLDivElement;
  private readonly stops: Stop[] = [];
  private readonly folders: Panel[] = [];

  constructor(title: string, open: boolean) {
    this.el = document.createElement('details');
    this.el.className = 'sf-panel';
    this.el.open = open;
    const summary = document.createElement('summary');
    summary.textContent = title;
    this.body = document.createElement('div');
    this.body.className = 'sf-body';
    this.el.append(summary, this.body);
  }

  slider(label: string, sig: Signal<number>, opts: SliderOptions): this {
    const { row, labelEl } = this.row(label);
    const output = document.createElement('output');
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(opts.min);
    input.max = String(opts.max);
    input.step = String(opts.step);
    labelEl.append(' ', output, document.createElement('br'), input);
    this.body.appendChild(row);

    const format = opts.format ?? String;
    this.stops.push(
      bindText(output, sig, (v) => format(v as number)),
      bindValue(input, sig),
    );
    if (opts.wheel ?? true) this.stops.push(bindWheel(input, sig));
    return this;
  }

  number(label: string, sig: Signal<number>, opts: Partial<Pick<SliderOptions, 'min' | 'max' | 'step'>> = {}): this {
    const input = document.createElement('input');
    input.type = 'number';
    if (opts.min !== undefined) input.min = String(opts.min);
    if (opts.max !== undefined) input.max = String(opts.max);
    if (opts.step !== undefined) input.step = String(opts.step);
    return this.field(label, input, sig);
  }

  text(label: string, sig: Signal<string>): this {
    const input = document.createElement('input');
    input.type = 'text';
    return this.field(label, input, sig);
  }

  toggle(label: string, sig: Signal<boolean>): this {
    const { row, labelEl } = this.row('');
    const input = document.createElement('input');
    input.type = 'checkbox';
    labelEl.append(input, ` ${label}`);
    this.body.appendChild(row);
    this.stops.push(bindValue(input, sig));
    return this;
  }

  select(label: string, sig: Signal<string | number>, options: SelectOption[]): this {
    const select = document.createElement('select');
    for (const opt of options) {
      const o = document.createElement('option');
      if (typeof opt === 'object') {
        o.value = String(opt.value);
        o.textContent = opt.label;
      } else {
        o.value = String(opt);
        o.textContent = String(opt);
      }
      select.appendChild(o);
    }
    return this.field(label, select, sig);
  }

  /** Consecutive buttons flow onto one line — native inline layout. */
  button(label: string | Readable<string>, onClick: (e: Event) => void, opts: { disabled?: Readable<unknown> } = {}): this {
    const button = document.createElement('button');
    if (typeof label === 'string') button.textContent = label;
    else this.stops.push(bindText(button, label));
    this.stops.push(listen(button, 'click', onClick));
    if (opts.disabled) this.stops.push(bindDisabled(button, opts.disabled));
    this.body.appendChild(button);
    return this;
  }

  /** Read-only value display: label + <output>. */
  readout(label: string, source: Readable<unknown>, format?: (v: unknown) => string): this {
    const { row, labelEl } = this.row(label);
    const output = document.createElement('output');
    labelEl.append(' ', output);
    this.body.appendChild(row);
    this.stops.push(bindText(output, source, format));
    return this;
  }

  /** Escape hatch: put any element (a canvas, a video tile) into the panel. */
  add(el: Element): this {
    this.body.appendChild(el);
    return this;
  }

  /** Nested collapsible group. Disposed with its parent. */
  folder(title: string, open = true): Panel {
    const child = new Panel(title, open);
    child.el.classList.replace('sf-panel', 'sf-folder');
    this.body.appendChild(child.el);
    this.folders.push(child);
    return child;
  }

  /** Stops every binding and listener, recursively, and removes the element. */
  dispose(): void {
    for (const folder of this.folders.splice(0)) folder.dispose();
    for (const stop of this.stops.splice(0)) stop();
    this.el.remove();
  }

  private row(label: string): { row: HTMLDivElement; labelEl: HTMLLabelElement } {
    const row = document.createElement('div');
    row.className = 'sf-row';
    const labelEl = document.createElement('label');
    if (label) labelEl.append(label);
    row.appendChild(labelEl);
    return { row, labelEl };
  }

  private field(label: string, input: HTMLInputElement | HTMLSelectElement, sig: Signal<any>): this {
    const { row, labelEl } = this.row(label);
    labelEl.append(' ', input);
    this.body.appendChild(row);
    this.stops.push(bindValue(input, sig));
    return this;
  }
}
