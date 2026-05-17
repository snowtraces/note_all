import { useState, useCallback, useRef } from 'react';

/**
 * useMention Hook: 封装输入框的 / 和 @ 联想逻辑
 */
export function useMention() {
  const [mentionType, setMentionType] = useState(null); // null | '/' | '@'
  const [mentionSearchText, setMentionSearchText] = useState('');
  const [triggerIndex, setTriggerIndex] = useState(-1);
  const inputRef = useRef(null);

  const handleInputChange = useCallback((e) => {
    const value = e.target.value;
    const cursor = e.target.selectionStart;
    
    // 如果已经在联想模式中
    if (mentionType) {
      const textFromTrigger = value.substring(triggerIndex + 1, cursor);
      // 如果光标移动到了触发符之前，或者中间有空格（通常代表结束联想）
      if (cursor <= triggerIndex || textFromTrigger.includes(' ')) {
        setMentionType(null);
        setMentionSearchText('');
        setTriggerIndex(-1);
      } else {
        setMentionSearchText(textFromTrigger);
      }
    }
  }, [mentionType, triggerIndex]);

  const handleInputKeyDown = useCallback((e) => {
    const cursor = e.target.selectionStart;
    
    if (e.key === '/' || e.key === '@') {
      // 只有在句首或者空格后才触发
      const charBefore = e.target.value[cursor - 1];
      if (!charBefore || charBefore === ' ') {
        setMentionType(e.key);
        setTriggerIndex(cursor);
        setMentionSearchText('');
      }
    }
  }, []);

  const handleSelectMention = useCallback((item, value, setValue) => {
    if (!inputRef.current) return;
    
    const beforeTrigger = value.substring(0, triggerIndex);
    const afterCursor = value.substring(inputRef.current.selectionStart);
    
    const insertion = mentionType === '/' ? `[[tool:${item.id}]] ` : `[[note:${item.id}|${item.title}]] `;
    const newValue = beforeTrigger + insertion + afterCursor;
    
    setValue(newValue);
    setMentionType(null);
    setMentionSearchText('');
    setTriggerIndex(-1);
    
    // 延迟聚焦并设置光标
    setTimeout(() => {
      inputRef.current?.focus();
      const newPos = beforeTrigger.length + insertion.length;
      inputRef.current?.setSelectionRange(newPos, newPos);
    }, 0);
  }, [mentionType, triggerIndex]);

  return {
    mentionType,
    mentionSearchText,
    triggerIndex,
    inputRef,
    handleInputChange,
    handleInputKeyDown,
    handleSelectMention,
    setMentionType // 用于关闭
  };
}
