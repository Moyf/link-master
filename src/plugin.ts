import { PluginValue, EditorView, ViewPlugin } from "@codemirror/view";
import { LinkDetector, LinkInfo } from "./linkDetector";
import type LinkMaster from "../main";

class LinkMasterPlugin implements PluginValue {
	private view: EditorView;
	private mainPlugin: LinkMaster | null = null;
	private lastCursorPos: number = -1;
	private currentHighlightedElements: HTMLElement[] = [];
	private currentLinkInfo: {start: number, end: number, type: string} | null = null;
	private updateTimeout: ReturnType<typeof setTimeout> | null = null;
	private isUpdating: boolean = false;
	
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
		if (!this.mainPlugin || this.isUpdating) return;
		
		// 防抖处理，避免过于频繁的更新
		if (this.updateTimeout) {
			clearTimeout(this.updateTimeout);
		}
		
		this.updateTimeout = setTimeout(() => {
			this.isUpdating = true;
			this.checkCursorPosition();
			this.isUpdating = false;
			this.updateTimeout = null;
		}, 200); // 增加延迟到200ms，确保稳定
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
	 * 直接在 CodeMirror 元素上添加高亮类
	 */
	private updateLinkHighlight(linkInfo: LinkInfo): void {
		// 检查是否在同一个链接内
		if (linkInfo.isInLink && linkInfo.linkStart !== undefined && linkInfo.linkEnd !== undefined && linkInfo.linkType) {
			const linkData = {
				start: linkInfo.linkStart,
				end: linkInfo.linkEnd,
				type: linkInfo.linkType
			};
			
			// 如果是同一个链接，不需要重新设置高亮
			if (this.currentLinkInfo && 
				this.currentLinkInfo.start === linkData.start && 
				this.currentLinkInfo.end === linkData.end &&
				this.currentLinkInfo.type === linkData.type &&
				this.currentHighlightedElements.length > 0) {
				console.log(`[Link Master] 🔄 Same link, keeping existing highlight`);
				return;
			}
			
			// 先清除所有高亮
			this.clearHighlight();
			
			// 查找并高亮对应的 CodeMirror 元素
			const elements = this.findCodeMirrorLinkElements(linkInfo.linkStart, linkInfo.linkEnd);
			
			if (elements.length > 0) {
				elements.forEach(element => {
					element.classList.add('link-master-active-link');
					element.setAttribute('data-link-type', linkInfo.linkType!);
					element.setAttribute('data-link-master', 'active');
				});
				
				// 保存状态
				this.currentHighlightedElements = elements;
				this.currentLinkInfo = linkData;
				
				console.log(`[Link Master] ✨ Added ${linkInfo.linkType} highlight to ${elements.length} CodeMirror elements`);
				
				// 延迟一小段时间后检查高亮是否还在，如果不在则重新添加
				setTimeout(() => {
					this.verifyHighlight();
				}, 100);
			} else {
				console.warn(`[Link Master] No CodeMirror link elements found for range ${linkInfo.linkStart}-${linkInfo.linkEnd}`);
			}
		} else {
			// 不在链接内，清除高亮
			if (this.currentLinkInfo) {
				console.log(`[Link Master] 🔄 Not in link, clearing highlight`);
				this.clearHighlight();
			}
		}
	}
	
	/**
	 * 验证高亮是否仍然存在，如果不存在则重新添加
	 */
	private verifyHighlight(): void {
		if (this.currentHighlightedElements.length > 0 && this.currentLinkInfo) {
			let needsReapply = false;
			
			this.currentHighlightedElements.forEach(element => {
				if (!element.classList.contains('link-master-active-link')) {
					needsReapply = true;
				}
			});
			
			if (needsReapply) {
				console.log(`[Link Master] 🔧 Re-applying highlight that was removed`);
				this.currentHighlightedElements.forEach(element => {
					element.classList.add('link-master-active-link');
					element.setAttribute('data-link-type', this.currentLinkInfo!.type);
					element.setAttribute('data-link-master', 'active');
				});
			}
		}
	}
	
	/**
	 * 查找光标位置处的具体 CodeMirror 链接元素
	 */
	private findCodeMirrorLinkElements(start: number, end: number): HTMLElement[] {
		const elements: HTMLElement[] = [];
		
		try {
			// 获取光标位置的坐标
			const cursorPos = this.view.state.selection.main.head;
			const cursorCoords = this.view.coordsAtPos(cursorPos);
			
			if (!cursorCoords) {
				console.warn('[Link Master] Could not get cursor coordinates');
				return elements;
			}
			
			console.log(`[Link Master] Looking for element at cursor position:`, cursorPos, cursorCoords);
			
			// 使用 elementFromPoint 找到光标位置的确切元素
			const elementAtCursor = document.elementFromPoint(
				cursorCoords.left, 
				cursorCoords.top
			) as HTMLElement;
			
			if (!elementAtCursor) {
				console.warn('[Link Master] No element found at cursor position');
				return elements;
			}
			
			console.log('[Link Master] Element at cursor:', elementAtCursor.className, elementAtCursor.textContent?.substring(0, 30));
			
			// 检查光标处的元素及其父元素是否是链接相关的
			let currentElement: HTMLElement | null = elementAtCursor;
			let depth = 0;
			
			while (currentElement && depth < 5) {
				const classes = currentElement.className || '';
				
				// 检查是否是我们要找的链接元素
				if (classes.includes('cm-link') || 
					classes.includes('cm-url') || 
					classes.includes('cm-hmd-internal-link') ||
					classes.includes('cm-link-text') ||
					classes.includes('cm-formatting-link')) {
					
					// 进一步细化：根据光标在链接内的位置决定高亮哪个部分
					const targetElement = this.getSpecificLinkElement(currentElement, cursorPos);
					if (targetElement) {
						elements.push(targetElement);
						console.log(`[Link Master] Found specific link element:`, targetElement.className, targetElement.textContent?.substring(0, 30));
						break;
					}
				}
				
				currentElement = currentElement.parentElement;
				depth++;
			}
			
			// 如果还是没找到，尝试在同一行查找链接元素
			if (elements.length === 0) {
				elements.push(...this.findLinkElementsInLine(cursorPos));
			}
			
		} catch (error) {
			console.warn('[Link Master] Error finding CodeMirror elements:', error);
		}
		
		return elements;
	}
	
	/**
	 * 根据光标位置获取具体应该高亮的链接元素
	 */
	private getSpecificLinkElement(linkContainer: HTMLElement, cursorPos: number): HTMLElement | null {
		// 如果容器本身就是我们要的元素，直接返回
		const classes = linkContainer.className || '';
		
		if (classes.includes('cm-link') && !classes.includes('cm-formatting')) {
			console.log('[Link Master] Found cm-link element');
			return linkContainer;
		}
		
		if (classes.includes('cm-url') && !classes.includes('cm-formatting')) {
			console.log('[Link Master] Found cm-url element');
			return linkContainer;
		}
		
		// 在容器内查找具体的子元素
		const linkElements = linkContainer.querySelectorAll('.cm-link, .cm-url');
		for (let i = 0; i < linkElements.length; i++) {
			const element = linkElements[i] as HTMLElement;
			try {
				// 检查光标是否在这个元素的范围内
				const rect = element.getBoundingClientRect();
				const coords = this.view.coordsAtPos(cursorPos);
				
				if (coords && this.isElementInRange(rect, coords, coords)) {
					return element;
				}
			} catch (error) {
				// 忽略坐标获取错误
			}
		}
		
		return linkContainer;
	}
	
	/**
	 * 在当前行查找链接元素
	 */
	private findLinkElementsInLine(cursorPos: number): HTMLElement[] {
		const elements: HTMLElement[] = [];
		
		try {
			const state = this.view.state;
			const line = state.doc.lineAt(cursorPos);
			const cursorCoords = this.view.coordsAtPos(cursorPos);
			
			if (!cursorCoords) return elements;
			
			// 查找当前行的所有链接元素
			const lineElements = this.view.dom.querySelectorAll('.cm-line');
			
			for (let i = 0; i < lineElements.length; i++) {
				const lineEl = lineElements[i] as HTMLElement;
				const lineRect = lineEl.getBoundingClientRect();
				
				// 检查是否是当前行
				if (Math.abs(lineRect.top - cursorCoords.top) < 5) {
					const linkElements = lineEl.querySelectorAll('.cm-link, .cm-url');
					
					for (let j = 0; j < linkElements.length; j++) {
						const element = linkElements[j] as HTMLElement;
						const rect = element.getBoundingClientRect();
						
						// 检查光标是否在这个链接元素的水平范围内
						if (cursorCoords.left >= rect.left && cursorCoords.left <= rect.right) {
							elements.push(element);
							console.log('[Link Master] Found link element in line:', element.className, element.textContent?.substring(0, 20));
						}
					}
					break;
				}
			}
		} catch (error) {
			console.warn('[Link Master] Error finding link elements in line:', error);
		}
		
		return elements;
	}
	
	/**
	 * 检查元素是否在指定坐标范围内
	 */
	private isElementInRange(rect: DOMRect, startCoords: {left: number, top: number}, endCoords: {left: number, top: number}): boolean {
		// 检查垂直位置是否匹配（同一行）
		const verticalMatch = Math.abs(rect.top - startCoords.top) < 5;
		
		// 检查水平位置是否在范围内
		const horizontalMatch = rect.left <= endCoords.left && rect.right >= startCoords.left;
		
		return verticalMatch && horizontalMatch;
	}

	/**
	 * 查找指定位置范围内的DOM元素
	 */
	private findElementAtPosition(start: number, end: number): HTMLElement | null {
		try {
			const startCoords = this.view.coordsAtPos(start);
			const endCoords = this.view.coordsAtPos(end);
			
			if (!startCoords || !endCoords) {
				console.warn('[Link Master] Could not get coordinates for positions:', start, end);
				return null;
			}

			console.log('[Link Master] Looking for element at coords:', startCoords);

			// 在中间位置查找元素，更准确
			const midX = (startCoords.left + endCoords.left) / 2;
			const midY = (startCoords.top + endCoords.bottom) / 2;
			
			const element = document.elementFromPoint(midX, midY) as HTMLElement;

			if (!element) {
				console.warn('[Link Master] No element found at coordinates');
				return null;
			}

			// 确保元素在编辑器内
			if (!this.view.dom.contains(element)) {
				console.warn('[Link Master] Element not in editor DOM');
				return null;
			}

			console.log('[Link Master] Found element:', element.tagName, element.className, element.textContent?.substring(0, 50));

			// 优先查找已有的链接相关元素
			let current: HTMLElement | null = element;
			let attempts = 0;
			
			while (current && current !== this.view.dom && attempts < 10) {
				attempts++;
				
				// 检查是否是文本节点的父元素
				if (current.nodeType === Node.ELEMENT_NODE) {
					const text = current.textContent || '';
					
					// 检查是否包含链接标记
					if (text.includes('[[') && text.includes(']]') || 
						text.includes('](') && text.includes('[')) {
						console.log('[Link Master] Found link container:', current.tagName, current.className);
						return current;
					}
					
					// 如果是叶子节点且包含文本，直接返回
					if (current.children.length === 0 && text.trim()) {
						console.log('[Link Master] Using leaf text element:', current.tagName, current.className);
						return current;
					}
				}
				
				current = current.parentElement;
			}

			// 如果没找到更好的元素，返回原始元素
			console.log('[Link Master] Using original element:', element.tagName, element.className);
			return element;
		} catch (error) {
			console.warn('[Link Master] Error finding element at position:', error);
		}
		
		return null;
	}

	/**
	 * 清除当前高亮
	 */
	private clearHighlight(): void {
		// 清理所有带有我们标记的元素
		const highlightedElements = this.view.dom.querySelectorAll('.link-master-active-link');
		highlightedElements.forEach(el => {
			el.classList.remove('link-master-active-link');
			el.removeAttribute('data-link-type');
			el.removeAttribute('data-link-master');
		});
		
		// 清理引用
		this.currentHighlightedElements = [];
		this.currentLinkInfo = null;
		
		console.log(`[Link Master] 🧹 Cleared ${highlightedElements.length} highlighted elements`);
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
		if (this.updateTimeout) {
			clearTimeout(this.updateTimeout);
			this.updateTimeout = null;
		}
		this.isUpdating = false;
		this.clearHighlight();
		this.mainPlugin = null;
	}
}

// 导出 ViewPlugin 实例
export const linkMasterPlugin = ViewPlugin.fromClass(LinkMasterPlugin);