import { Plugin, WorkspaceLeaf, MarkdownView } from "obsidian";
import { EditorView } from "@codemirror/view";
import { linkMasterPlugin } from "./src/plugin";

export default class LinkMaster extends Plugin {
	
	async onload() {
		console.log("Loading Link Master plugin");
		
		// 注册 CodeMirror 扩展
		this.registerEditorExtension(linkMasterPlugin);
		
		// 监听活动叶子变化，确保插件正确初始化
		this.app.workspace.onLayoutReady(() => {
			this.setupEditorPlugin(this.app.workspace.getMostRecentLeaf());
		});

		this.registerEvent(
			this.app.workspace.on(
				"active-leaf-change",
				async (leaf: WorkspaceLeaf) => {
					this.setupEditorPlugin(leaf);
				}
			)
		);
	}

	onunload() {
		console.log("Unloading Link Master plugin");
	}

	private setupEditorPlugin(leaf: WorkspaceLeaf): void {
		// 确保只在 Markdown 视图中工作
		const view = leaf?.view;
		if (!(view instanceof MarkdownView)) return;

		// @ts-ignore - 访问内部编辑器对象
		const editor = view.editor;
		if (editor) {
			// @ts-ignore - 访问 CodeMirror 实例
			const editorView = editor.cm as EditorView;
			const plugin = editorView.plugin(linkMasterPlugin);
			if (plugin) {
				// @ts-ignore - 类型转换到我们的插件实例
				(plugin as any).initializePlugin(this);
			}
		}
	}
}