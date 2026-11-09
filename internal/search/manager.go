package search

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"sync"
)

// Event is what the frontend receives while a search runs. Every event carries
// the search ID; the last one has Done set (and either Summary or Error).
type Event struct {
	ID      string       `json:"id"`
	Files   []FileResult `json:"files,omitempty"`
	Done    bool         `json:"done"`
	Summary *Summary     `json:"summary,omitempty"`
	Error   string       `json:"error,omitempty"`
}

// Manager runs searches in the background and lets them be cancelled by ID.
type Manager struct {
	mu      sync.Mutex
	running map[string]*activeSearch
}

// activeSearch is compared by pointer, so a finishing search never removes the entry of
// a newer one that reused its ID.
type activeSearch struct{ cancel context.CancelFunc }

func NewManager() *Manager {
	return &Manager{running: map[string]*activeSearch{}}
}

func newID() string {
	var raw [8]byte
	_, _ = rand.Read(raw[:])
	return hex.EncodeToString(raw[:])
}

// Start validates the search and runs it in a goroutine. Problems with the
// options (bad regex, no folder) are returned here; results and completion
// come through emit. A search that reuses the ID of a running one replaces it.
func (m *Manager) Start(opts Options, emit func(Event)) (string, error) {
	s, err := New(opts)
	if err != nil {
		return "", err
	}
	id := opts.ID
	if id == "" {
		id = newID()
	}

	ctx, cancel := context.WithCancel(context.Background())
	self := &activeSearch{cancel: cancel}
	m.mu.Lock()
	if previous, ok := m.running[id]; ok {
		previous.cancel()
	}
	m.running[id] = self
	m.mu.Unlock()

	go func() {
		defer func() {
			cancel()
			m.mu.Lock()
			if m.running[id] == self {
				delete(m.running, id)
			}
			m.mu.Unlock()
		}()
		summary := s.Run(ctx, func(files []FileResult) {
			emit(Event{ID: id, Files: files})
		})
		emit(Event{ID: id, Done: true, Summary: &summary})
	}()
	return id, nil
}

// Cancel stops a running search. Unknown IDs are ignored.
func (m *Manager) Cancel(id string) {
	m.mu.Lock()
	r := m.running[id]
	m.mu.Unlock()
	if r != nil {
		r.cancel()
	}
}
