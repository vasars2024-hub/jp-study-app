/** TreeView — expandable tree with keyboard expand/collapse. Phase 1 · M5b. */
import { useState, type KeyboardEvent, type ReactNode } from 'react';

export interface TreeNode {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  children?: TreeNode[];
}

export interface TreeViewProps {
  nodes: TreeNode[];
  defaultExpanded?: string[];
  onSelect?: (id: string) => void;
  className?: string;
  'aria-label'?: string;
}

export function TreeView({ nodes, defaultExpanded = [], onSelect, className = '', ...rest }: TreeViewProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(defaultExpanded));

  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, node: TreeNode) => {
    const hasChildren = !!node.children?.length;
    if (e.key === 'ArrowRight' && hasChildren && !expanded.has(node.id)) {
      e.preventDefault();
      toggle(node.id);
    } else if (e.key === 'ArrowLeft' && hasChildren && expanded.has(node.id)) {
      e.preventDefault();
      toggle(node.id);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (hasChildren) toggle(node.id);
      onSelect?.(node.id);
    }
  };

  const renderNodes = (list: TreeNode[], depth: number): ReactNode =>
    list.map((node) => {
      const hasChildren = !!node.children?.length;
      const isOpen = expanded.has(node.id);
      return (
        <div key={node.id} role="treeitem" aria-expanded={hasChildren ? isOpen : undefined}>
          <button
            type="button"
            className="ui-tree__row"
            style={{ paddingLeft: 8 + depth * 16 }}
            onClick={() => {
              if (hasChildren) toggle(node.id);
              onSelect?.(node.id);
            }}
            onKeyDown={(e) => onKeyDown(e, node)}
          >
            <span
              className={[
                'ui-tree__twisty',
                hasChildren ? (isOpen ? 'ui-tree__twisty--open' : '') : 'ui-tree__twisty--leaf',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-hidden="true"
            >
              <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
                <path d="M2 0l4 4-4 4z" />
              </svg>
            </span>
            {node.icon}
            <span>{node.label}</span>
          </button>
          {hasChildren && isOpen && (
            <div role="group">{renderNodes(node.children!, depth + 1)}</div>
          )}
        </div>
      );
    });

  return (
    <div className={['ui-tree', className].filter(Boolean).join(' ')} role="tree" {...rest}>
      {renderNodes(nodes, 0)}
    </div>
  );
}

export default TreeView;
