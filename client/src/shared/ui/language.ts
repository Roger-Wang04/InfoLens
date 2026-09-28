import * as d3 from 'd3';
import { getLanguagePreference, setLanguage, tr, type LanguagePreference } from '../../shared/lang/i18n-lite';
import { createSettingsDropdown } from './settingsDropdown';

export type LanguageManagerOptions = {
    onLanguageChange?: () => void;
};

export type LanguageManager = {
    dispose: () => void;
};

const languageOptions: Array<{ lang: LanguagePreference; label: string }> = [
    { lang: 'en', label: 'English' },
    { lang: 'zh', label: 'Chinese' },
    { lang: 'auto', label: 'Auto' },
];

export function initLanguageManager(options: LanguageManagerOptions = {}, containerSelector: string = '#language_toggle'): LanguageManager {
    const { onLanguageChange } = options;
    const container = d3.select(containerSelector);

    const selectLang = (lang: LanguagePreference) => {
        setLanguage(lang);
        dropdown.updateCurrent(lang);
        onLanguageChange?.();
        location.reload();
    };

    const dropdown = createSettingsDropdown<LanguagePreference>({
        container,
        classPrefix: 'language',
        options: languageOptions.map(({ lang, label }) => ({ value: lang, html: `<span>${tr(label)}</span>` })),
        dataAttr: 'data-lang',
        bodyClickNamespace: 'language-dropdown',
        onSelect: selectLang,
    });

    dropdown.updateCurrent(getLanguagePreference());

    return {
        dispose: () => {
            dropdown.dispose();
        },
    };
}
