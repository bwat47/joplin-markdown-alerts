import { addAlertContainerClass } from './alertContainerClass';

describe('addAlertContainerClass', () => {
    test('adds the class to the alert container opening tag', () => {
        const html = '<div class="markdown-alert markdown-alert-note"><p class="markdown-alert-title">Note</p>';
        expect(addAlertContainerClass(html, 'extra')).toBe(
            '<div class="markdown-alert extra markdown-alert-note"><p class="markdown-alert-title">Note</p>'
        );
    });

    test('leaves unexpected HTML unchanged', () => {
        const html = '<blockquote class="markdown-alert markdown-alert-note">';
        expect(addAlertContainerClass(html, 'extra')).toBe(html);
    });
});
