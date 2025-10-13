import { PluginValue, EditorView, ViewPlugin } from "@codemirror/view";
import { LinkDetector, LinkInfo } from "./linkDetector";
import type LinkMaster from "../main";

class LinkMasterPlugin implements PluginValue {
	private view: EditorView;
	private mainPlugin: LinkMaster | null = null;
	private lastCursorPos: number = -1;
	
	constructor(view: EditorView) {
		this.view = view;
	}
	
	/**
	 * 由主插件调用来初始化
	 */
	initializePlugin(plugin: LinkMaster) {
		this.mainPlugin = plugin;
		// 立即检查当前位置
		this.checkCursorPosition();
	}
	
	/**
	 * CodeMirror 自动调用此方法响应编辑器状态变化
	 */
	update(): void {
		if (!this.mainPlugin) return;
		
		this.checkCursorPosition();
	}
	
	/**
	 * 检查光标位置并打印信息
	 */
	private checkCursorPosition(): void {
		const state = this.view.state;
		const selection = state.selection.main;
		const currentPos = selection.head;
		
		// 只有当光标位置真正改变时才处理
		if (currentPos === this.lastCursorPos) return;
		
		this.lastCursorPos = currentPos;
		
		// 检测链接
		const linkInfo: LinkInfo = LinkDetector.detectLinkAtPosition(state.doc, currentPos);
		
		// 格式化并打印信息
		const positionInfo = LinkDetector.formatCursorInfo(state.doc, currentPos, linkInfo);
		console.log(`[Link Master] ${positionInfo}`);
		
		// 如果在链接内，可以添加额外的处理逻辑
		if (linkInfo.isInLink) {
			this.handleLinkContext(linkInfo);
		}
	}
	
	/**
	 * 处理在链接内的特殊逻辑
	 */
	private handleLinkContext(linkInfo: LinkInfo): void {
		// 这里可以添加更多的处理逻辑
		// 比如高亮显示、显示预览、快捷操作等
		
		if (linkInfo.linkType === "wiki") {
			if (linkInfo.isInAlias !== undefined) {
				if (linkInfo.isInAlias) {
					console.log(`[Link Master] 🏷️ Wiki link alias detected: "${linkInfo.aliasText}" -> "${linkInfo.linkUrl}"`);
				} else {
					console.log(`[Link Master] 🔗 Wiki link target detected: "${linkInfo.linkText}" (has alias: "${linkInfo.aliasText}")`);
				}
			} else {
				console.log(`[Link Master] 🔗 Simple wiki link detected: "${linkInfo.linkText}"`);
			}
		} else if (linkInfo.linkType === "markdown") {
			if (linkInfo.inUrlPart) {
				console.log(`[Link Master] 🌐 Markdown URL detected: "${linkInfo.linkUrl}"`);
			} else if (linkInfo.inTextPart) {
				console.log(`[Link Master] 📝 Markdown text detected: "${linkInfo.linkText}"`);
			}
		}
	}
	
	/**
	 * 插件销毁时调用
	 */
	destroy(): void {
		this.mainPlugin = null;
	}
}

// 导出 ViewPlugin 实例
export const linkMasterPlugin = ViewPlugin.fromClass(LinkMasterPlugin);