import { PluginValue, EditorView, ViewPlugin } from "@codemirror/view";
import { LinkDetector, LinkInfo } from "./linkDetector";
import type LinkMaster from "../main";

class LinkMasterPlugin implements PluginValue {
	private view: EditorView;
	private mainPlugin: LinkMaster | null = null;
	private lastCursorPos: number = -1;
	private currentHighlightedElement: HTMLElement | null = null;

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
		
		// 延迟执行以避免更新冲突
		setTimeout(() => {
			this.checkCursorPosition();
		}, 0);
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

		// 处理链接高亮
		this.updateLinkHighlight(linkInfo);

		// 如果在链接内，可以添加额外的处理逻辑
		if (linkInfo.isInLink) {
			this.handleLinkContext(linkInfo);
		}
	}

	/**
	 * 使用 DOM 操作更新链接高亮状态
	 */
	private updateLinkHighlight(linkInfo: LinkInfo): void {
		// 清除之前的高亮
		this.clearHighlight();

		// 如果在链接内，添加新的高亮
		if (linkInfo.isInLink && linkInfo.linkStart !== undefined && linkInfo.linkEnd !== undefined) {
			const element = this.findElementAtPosition(linkInfo.linkStart, linkInfo.linkEnd);
			if (element) {
				element.classList.add('link-master-active-link');
				if (linkInfo.linkType) {
					element.setAttribute('data-link-type', linkInfo.linkType);
				}
				this.currentHighlightedElement = element;
				console.log(`[Link Master] ✨ Added ${linkInfo.linkType} link highlight via DOM`);
			}
		}
	}

	/**
	 * 查找指定位置范围内的DOM元素
	 */
	private findElementAtPosition(start: number, end: number): HTMLElement | null {
		try {
			const startCoords = this.view.coordsAtPos(start);
			const endCoords = this.view.coordsAtPos(end);
			
			if (!startCoords || !endCoords) return null;

			// 在起始位置查找元素
			const element = document.elementFromPoint(
				startCoords.left + 1, 
				startCoords.top + 1
			) as HTMLElement;

			// 确保元素在编辑器内
			if (element && this.view.dom.contains(element)) {
				// 寻找包含链接的最近父元素
				let current = element;
				while (current && current !== this.view.dom) {
					if (current.textContent && current.textContent.includes('[[') || 
						current.textContent && current.textContent.includes('](')) {
						return current;
					}
					current = current.parentElement as HTMLElement;
				}
				return element;
			}
		} catch (error) {
			console.warn('[Link Master] Error finding element at position:', error);
		}
		
		return null;
	}

	/**
	 * 清除当前高亮
	 */
	private clearHighlight(): void {
		if (this.currentHighlightedElement) {
			this.currentHighlightedElement.classList.remove('link-master-active-link');
			this.currentHighlightedElement.removeAttribute('data-link-type');
			this.currentHighlightedElement = null;
		}

		// 清理所有可能残留的高亮
		const highlightedElements = this.view.dom.querySelectorAll('.link-master-active-link');
		highlightedElements.forEach(el => {
			el.classList.remove('link-master-active-link');
			el.removeAttribute('data-link-type');
		});
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
		// 清理高亮
		this.clearHighlight();
		this.mainPlugin = null;
	}
}

// 导出 ViewPlugin 实例
export const linkMasterPlugin = ViewPlugin.fromClass(LinkMasterPlugin);