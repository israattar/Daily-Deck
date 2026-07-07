// Wishlist — synced from a shared GoWish list (best effort) plus manual
// items. Split into "still wishing" and "bought".
import React, { useState } from 'react';
import { deck, isDesktop, openLink, useStore } from '../../api';
import { DEFAULT_SETTINGS } from '../../lib/defaults';
import { SectionHead, Tabs, Empty, Modal, Field } from '../../components/ui';

export default function WishlistSection() {
  const [wishlist, setWishlist] = useStore('wishlist', { items: [], syncedAt: null });
  const [settings] = useStore('settings', DEFAULT_SETTINGS);
  const [tab, setTab] = useState('Wishlist');
  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');

  if (!wishlist) return null;

  const items = wishlist.items.filter((i) => (tab === 'Bought' ? i.bought : !i.bought));

  async function sync() {
    setSyncing(true);
    setMessage('');
    try {
      const result = await deck.invoke('gowish:sync', { shareUrl: settings?.gowish?.shareUrl });
      // Keep manual items and remembered "bought" flags; replace the synced ones.
      const manual = wishlist.items.filter((i) => i.manual);
      const boughtByTitle = new Set(wishlist.items.filter((i) => i.bought).map((i) => i.title));
      const synced = result.items.map((item, index) => ({
        id: `gw:${index}:${item.title}`,
        ...item,
        bought: boughtByTitle.has(item.title),
      }));
      setWishlist({ items: [...synced, ...manual], syncedAt: result.syncedAt });
      setMessage(`Synced ${synced.length} items from GoWish.`);
    } catch (err) {
      setMessage(err.message);
    }
    setSyncing(false);
  }

  function update(id, patch) {
    setWishlist({ ...wishlist, items: wishlist.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
  }

  function remove(id) {
    setWishlist({ ...wishlist, items: wishlist.items.filter((i) => i.id !== id) });
  }

  return (
    <div>
      <SectionHead
        title="Wishlist"
        sub={wishlist.syncedAt ? `Last GoWish sync ${new Date(wishlist.syncedAt).toLocaleString('en-GB')}` : 'Sync your GoWish list (add the share link in Settings) or add items manually'}
      >
        <Tabs tabs={['Wishlist', 'Bought']} active={tab} onChange={setTab} />
        <button className="btn" onClick={() => setAdding(true)}>+ Add item</button>
        <button className="btn primary" onClick={sync} disabled={syncing || !isDesktop}>
          {syncing ? 'Syncing…' : '↻ Sync GoWish'}
        </button>
      </SectionHead>

      {message && <p className="muted mb">{message}</p>}

      {items.length === 0 ? (
        <div className="card">
          <Empty icon={tab === 'Bought' ? '🛍️' : '🎁'}>
            {tab === 'Bought' ? 'Nothing bought yet.' : 'Your wishlist is empty.'}
          </Empty>
        </div>
      ) : (
        <div className="wish-grid">
          {items.map((item) => (
            <div className="wish-card" key={item.id}>
              <div className="thumb">{item.image ? <img src={item.image} alt="" /> : '🎁'}</div>
              <div className="body">
                <div className="name">{item.title}</div>
                {item.price && <div className="price">{item.price}</div>}
                <div className="foot">
                  {item.url && <button className="btn small" onClick={() => openLink(item.url)}>↗</button>}
                  <button className="btn small" onClick={() => update(item.id, { bought: !item.bought })}>
                    {item.bought ? '↩ Un-buy' : '✓ Bought'}
                  </button>
                  <button className="btn small danger" onClick={() => remove(item.id)}>🗑</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <AddModal
          onClose={() => setAdding(false)}
          onAdd={(item) => {
            setWishlist({ ...wishlist, items: [item, ...wishlist.items] });
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}

function AddModal({ onClose, onAdd }) {
  const [form, setForm] = useState({ title: '', price: '', url: '', image: '' });
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  return (
    <Modal title="Add wishlist item" onClose={onClose}>
      <div className="form">
        <Field label="Item"><input value={form.title} onChange={set('title')} autoFocus /></Field>
        <Field label="Price (optional)"><input value={form.price} onChange={set('price')} placeholder="£49.99" /></Field>
        <Field label="Link (optional)"><input value={form.url} onChange={set('url')} /></Field>
        <Field label="Image URL (optional)"><input value={form.image} onChange={set('image')} /></Field>
      </div>
      <div className="foot">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button
          className="btn primary"
          disabled={!form.title.trim()}
          onClick={() => onAdd({ ...form, id: `manual:${Date.now()}`, manual: true, bought: false })}
        >
          Add
        </button>
      </div>
    </Modal>
  );
}
