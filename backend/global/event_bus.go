package global

import "sync"

// EventBus 事件广播器，用于 SSE 实时推送
type EventBus struct {
	subscribers map[chan string]bool
	mu          sync.RWMutex
}

// NewEventBus 创建事件总线
func NewEventBus() *EventBus {
	return &EventBus{
		subscribers: make(map[chan string]bool),
	}
}

// Subscribe 订阅事件，返回接收 channel
func (b *EventBus) Subscribe() chan string {
	ch := make(chan string, 10)
	b.mu.Lock()
	b.subscribers[ch] = true
	b.mu.Unlock()
	return ch
}

// Unsubscribe 取消订阅
func (b *EventBus) Unsubscribe(ch chan string) {
	b.mu.Lock()
	delete(b.subscribers, ch)
	close(ch)
	b.mu.Unlock()
}

// Publish 发布事件到所有订阅者
func (b *EventBus) Publish(event string) {
	b.mu.RLock()
	for ch := range b.subscribers {
		select {
		case ch <- event:
		default:
			// channel 满了，跳过（避免阻塞）
		}
	}
	b.mu.RUnlock()
}