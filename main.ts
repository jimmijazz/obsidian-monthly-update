
import { App, TFolder, TFile, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	tags: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	tags: 'default'
}



export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {

		const tags = ['business-update', 'coding-update', 'monthly-update']; // The tags that we want to search for. TODO: will have this as a setting
		const monthly_update_file_name = 'Monthly Update'; // File name of the monthly update file each month will have

		await this.loadSettings();
		this.addSettingTab(new SampleSettingTab(this.app, this));	// This adds a settings tab so the user can configure various aspects of the plugin
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000)); // When registering intervals, this function will automatically clear the interval when the plugin is disabled.

		/* Find all occurences of the tags in the files */

		/* GET MARKDOWN OF ALL FILES AND CREATE COUNT OF OBJECTS */
		const occurences_of_tags_in_date = {}; // Contains the count of each tag in each file 
		/*
			dates = {
				23-01 : {
					business-updates: {
						count : 0,
						snippets: [
							{
								"link" : "",
								"snippets" : ""
							}
						]
					}
				}
			}
		*/

		// Count all instances of tags in all files, then create or update the monthly update file for each month
		await countTagsInFiles()
			.then(async () => {
				await createOrModifyMonthlyUpdateFiles();
			})
			.catch((error) => {
				console.error('Error counting tags in files: ', error);
			});

		async function countTagsInFiles() {
			const file_paths = app.vault.getFiles().map(file => file.path); // Get all markdown files
			const promises = [];

			file_paths.forEach((file_path) => {
				const file = app.vault.getAbstractFileByPath(file_path);
				// console.log(`File path: `, file_path)
				if (file && file instanceof TFile) {
					const promise = app.vault.read(file)
						.then((content) => {
							// console.log('File: ', file_path, 'Content: ', content);
							const file_name = file_path.substring(file_path.lastIndexOf("/") + 1, file_path.lastIndexOf("."));

							if (!file_name.includes(monthly_update_file_name)) { // Ignore our monthly update files 
								const file_year = file_name.substring(0, 2);
								const file_month = file_name.substring(3, 5);
								const file_date = `${file_year}-${file_month}`;

								// If file contains any of our tags - update the count
								tags.forEach((tag) => {
									if (occurences_of_tags_in_date[file_date] == undefined) {
										occurences_of_tags_in_date[file_date] = {};
									}

									if (occurences_of_tags_in_date[file_date][tag] == undefined) {
										occurences_of_tags_in_date[file_date][tag] = {
											count: 0,
											snippets: []
										};
									}
									// Find the number of occurences of the tag in the file and update the total count
									occurences_of_tags_in_date[file_date][tag]['count'] += countOccurrences(content, `#${tag}`);

									const snippets = getSnippets(content, `#${tag}`);
									snippets.forEach((snippet) => {
										occurences_of_tags_in_date[file_date][tag]['snippets'].push(...[{ 'link': file_path, 'snippet': snippet }]);
									});

								});
							}
						})
						.catch((error) => {
							console.error(`Error reading file "${file_path}":`, error);
						});

					promises.push(promise);
				} else {
					console.error(`File "${file_path}" not found or not a valid TFile object.`);
				}
			});

			await Promise.all(promises);
			// console.log('Final dates: ', occurences_of_tags_in_date);
			return;
		}


		function countOccurrences(mainString, searchString) {
			// Check if either string is empty
			if (!mainString || !searchString) {
				return 0;
			}

			// Use regular expression with the 'g' flag to match all occurrences
			const regex = new RegExp(searchString, 'g');
			const matches = mainString.match(regex);

			// Return the count of matches
			return matches ? matches.length : 0;
		}

		function getSnippets(content:string, tag:string, stopStrings = tags) {
			let result = [];
			let currentIndex = 0;

			while (true) {
				const foundIndex = content.indexOf(tag, currentIndex);

				if (foundIndex === -1) {
					break;
				}

				const followingContent = content.substr(foundIndex + tag.length, 100);
				let includeSnippet = true;

				// Check if any stop string is encountered
				for (const stopString of stopStrings) {
					if (followingContent.includes(stopString)) {
						includeSnippet = false;
						break;
					}
				}

				if (includeSnippet) {
					result.push(followingContent);
				}

				currentIndex = foundIndex + 1;
			}

			return result;
		}



		/* Upsert the monthly update file for each date */
		/*
		Create an array of strings. Each string is a date in format YY-MM.
		It increase in months starting from 21-01-01 and goes up to the current month.
		So the first array would start with: ['21-01','21-02'...] 
		and end with the current month
		*/

		async function createOrModifyMonthlyUpdateFiles() {
			const dateArray = generateDateArray(); // Array of dates in format YY-MM
			const promises = [];

			// console.log('Date array: ', dateArray)
			// For each date, make sure there is a monthly update file
			dateArray.forEach(async function (date) {
				// Make sure there is a monthly update file located in Personal/Diary/YYYY/MM/monthly-update.md
				// If there is no file, create one
				// console.log(`Checking file for ${date}`);

				const year = `20${date.slice(0, 2)}`;
				const month = `${date.slice(3, 5)}`;
				const monthlyUpdateFilePath = `Personal/Diary/${year}/${month}/${monthly_update_file_name}.md`;

				const monthlyUpdateFile = app.vault.getAbstractFileByPath(monthlyUpdateFilePath);

				if (!monthlyUpdateFile || monthlyUpdateFile == null) { // No file, create
					console.log(`No file found for ${date}. Monthly update file at location: ${monthlyUpdateFile} Creating...`)
					const directoryPath = monthlyUpdateFilePath.substring(0, monthlyUpdateFilePath.lastIndexOf("/"));

					/* Create or update the markdown file. If the folder doesn't exist, create it first */
					const exists = await checkFolderExists(directoryPath);

					if (exists) {
						console.log('Folder exists, creating file...', monthlyUpdateFilePath, occurences_of_tags_in_date[date]);
						app.vault.create(monthlyUpdateFilePath, formatAndReturnMarkdown(date, occurences_of_tags_in_date[date]));
					} else {
						app.vault.createFolder(directoryPath)
							.then(() => {
								return app.vault.create(monthlyUpdateFilePath, formatAndReturnMarkdown(date, occurences_of_tags_in_date[date]));
							})
							.then((createdFile) => {
								console.log(`File "${createdFile.path}" created successfully.`);
							})
							.catch((error) => {
								console.error("Error creating file:", error, "File: ", monthlyUpdateFilePath);
								console.error('Existing file: ', monthlyUpdateFile);
							});
					}
				} else {
					// File exists, just update
					const monthlyUpdateMarkdown = formatAndReturnMarkdown(date, occurences_of_tags_in_date[date]);

					const promise = app.vault.read(monthlyUpdateFile)
						.then((existingArticleContent) => {

							const newArticleContent = deleteWrapupSection(existingArticleContent) + monthlyUpdateMarkdown;
							// console.log('New Article Content: ', newArticleContent);
							const updateFilePromise = app.vault.modify(monthlyUpdateFile, newArticleContent)
								.then((updatedFile) => {
									// console.log(`File "${updatedFile}" updated successfully.`);
								})
								.catch((error) => {
									console.error("Error updating file:", error, "File: ", monthlyUpdateFile, "Content: ", newArticleContent);
								});

							promises.push(updateFilePromise);

						})
						.catch((error) => {
							console.error(`Error reading file "${monthlyUpdateFile}":`, error);
						});

					promises.push(promise)

				}
			});

			await Promise.all(promises);
		}

		async function checkFolderExists(folderPath: string) {
			return app.vault.adapter.exists(folderPath);
		}

		function returnMonthlyUpdateHeader(date) {
			return `# Wrapup - ${date} (bot)\n\n *These starts are provided by the Custom Monthly Update plugin.*\n\n`; // Header of the monthly update file so we know where to being content
		}

		function formatAndReturnMarkdown(date, data) {
			let markdown = "";
			const monthly_update_header = returnMonthlyUpdateHeader(date); // Header of the monthly update file so we know where to being content
			const monthly_update_footer = '\n --- End Wrapup ---'; // Footer of the monthly update file so we know where to end content

			markdown += monthly_update_header;
			tags.forEach(function (tag) {

				markdown += `### ${tag}\n`;
				markdown += `Count: ${data?.[tag].count || 0}\n\n`;
				// Add table
				if (data?.[tag].snippets.length > 0) {
					markdown += generateObsidianTableMarkdown(data[tag]['snippets']);
					markdown += '\n';
				}
			});

			markdown += monthly_update_footer;

			return markdown;
		}

		function generateObsidianTableMarkdown(data) {
			let markdown = "| File | Snippet |\n";
			markdown += "|------|---------|\n";
			for (const item of data) {
				const { link, snippet } = item;

				if (typeof link === 'string' && typeof snippet === 'string') {
					markdown += `| [${link.split("/").pop()}](${link}) | ${snippet} | \n`;
				}
			}

			return markdown;
		}

		function getFormattedDateString(date) {
			const year = date.getFullYear().toString().slice(-2);
			const month = (date.getMonth() + 1).toString().padStart(2, '0');
			return `${year}-${month}`;
		}

		function deleteWrapupSection(inputString: string) {
			const startTag = "# Wrapup -";
			const endTag = "--- End Wrapup ---";

			let startIndex = inputString.indexOf(startTag);
			let endIndex = inputString.indexOf(endTag) + endTag.length;

			while (startIndex !== -1 && endIndex !== -1) {
				const deletedSection = inputString.substring(startIndex, endIndex);
				inputString = inputString.replace(deletedSection, "");

				startIndex = inputString.indexOf(startTag);
				endIndex = inputString.indexOf(endTag) + endTag.length;
			}

			return inputString;
		}


		function generateDateArray() {
			const currentDate = new Date();
			const startDate = new Date('2021-01-01');
			const dates = [];

			while (startDate <= currentDate) {
				dates.push(getFormattedDateString(startDate));
				startDate.setMonth(startDate.getMonth() + 1);
			}
			return dates;
		}

		// // Delete any file named monthly-update.md. For testing
		// app.vault.getFiles().forEach((file) => {
		// 	if (file.name.includes(monthly_update_file_name)) {
		// 		app.vault.delete(file);
		// 	}
		// });

	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}



class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: '' });

		new Setting(containerEl)
			.setName('Tags')
			.setDesc('List of comma seperate tags to look for (eg business-update, coding-update')
			.addText(text => text
				.setPlaceholder('business-update, coding-update')
				.setValue(this.plugin.settings.tags)
				.onChange(async (value) => {
					this.plugin.settings.tags = value;
					await this.plugin.saveSettings();
				}));
	}
}
