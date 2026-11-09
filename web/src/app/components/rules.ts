import { Component, input } from '@angular/core';
import { RuleView } from '../models';

@Component({
  selector: 'app-rules',
  template: `
    <ol class="rules">
      @for (rule of items(); track rule.number) {
        <li [value]="rule.number">
          <span class="rule-number">{{ rule.number }}</span>
          <div>
            <span class="rule-title">{{ rule.title }}</span>
            <span class="rule-text">{{ rule.text }}</span>
            @if (rule.advice) {
              <em class="rule-advice">{{ rule.advice }}</em>
            }
          </div>
        </li>
      }
    </ol>
  `,
})
export class Rules {
  readonly items = input.required<RuleView[]>();
}
