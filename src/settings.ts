import { App, PluginSettingTab, Setting } from 'obsidian';
import ComicScripter from './main';

export interface ComicScripterSettings {
    hrRule: boolean;
    handedness: boolean;
    flipHandedness: boolean;
}

export const DEFAULT_SETTINGS: ComicScripterSettings = {
    hrRule: true,
    handedness: false,
    flipHandedness: false,
};

export class ComicScripterSettingTab extends PluginSettingTab {
    plugin: ComicScripter;

    constructor(app: App, plugin: ComicScripter) {
        super(app, plugin);
        this.plugin = plugin;
    }
    
    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('Page Separator')
            .setDesc('Adds a dividing line after each new page')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.hrRule)
                .onChange(async (value) => {
                    this.plugin.settings.hrRule = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Page Handedness')
            .setDesc('Labels each page as a Left or Right handed page, starting with the Right page. If this setting is off, you can still turn it on per note, by setting Frontmatter "Page Start" to either Left or Right')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.handedness)
                .onChange(async (value) => {
                    this.plugin.settings.handedness = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Flip Default Handedness')
            .setDesc('Sets the default handedness to start on the Left page instead of the Right')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.flipHandedness)
                .onChange(async (value) => {
                    this.plugin.settings.flipHandedness = value;
                    await this.plugin.saveSettings();
                }));

		new Setting(containerEl).setName('Instructions').setHeading();
		containerEl.createEl('p', {
			text: 'Designate a Page by typing "Page" or a capital "P" on its own line.',
			cls: 'setting-item-description'
		});

		containerEl.createEl('p', {
			text: 'Designate a Panel by typing "Panel" or a lowercase "p" on its own line.',
			cls: 'setting-item-description'
		});

		containerEl.createEl('p', {
			text: 'Designate Dialogue with a Character name followed by a colon. Also works for captions, descriptions, or SFX.',
			cls: 'setting-item-description'
		});

		containerEl.createEl('p', {
			text: 'Add Page Handedness per script with the frontmatter property "Page Start". Set it to "Right", "R", "Left", "L", or "none" to override the default setting.',
			cls: 'setting-item-description'
		});
    }
}