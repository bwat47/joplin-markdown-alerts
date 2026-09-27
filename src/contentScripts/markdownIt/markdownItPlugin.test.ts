import MarkdownIt from 'markdown-it';

import markdownItPlugin from './markdownItPlugin';
import { SHOW_ALERT_BACKGROUND_SETTING } from '../../settingKeys';

const ALERT_MARKDOWN = '> [!NOTE]\n> Body';

function renderAlert(settings: Record<string, unknown>): string {
    const md = new MarkdownIt();
    const module = markdownItPlugin() as { plugin: (md: MarkdownIt, options: unknown) => void };
    module.plugin(md, { settingValue: (key: string) => settings[key] });
    return md.render(ALERT_MARKDOWN);
}

describe('markdownItPlugin alert background setting', () => {
    test('renders alerts without the no-background class by default', () => {
        const html = renderAlert({});
        expect(html).toContain('class="markdown-alert markdown-alert-note"');
        expect(html).not.toContain('markdown-alert-no-bg');
    });

    test('marks alerts with the no-background class when the setting is disabled', () => {
        const html = renderAlert({ [SHOW_ALERT_BACKGROUND_SETTING]: false });
        expect(html).toContain('class="markdown-alert markdown-alert-no-bg markdown-alert-note"');
    });
});
