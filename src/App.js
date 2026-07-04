import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabaseClient";
import "./App.css";

/* ================= STORAGE HELPER ================= */
const uploadImageToStorage = async (file) => {
  const ext = file.name.split(".").pop();
  const fileName = `${Date.now()}.${ext}`;
  const filePath = `articles/${fileName}`;

  const { error } = await supabase.storage
    .from("epaper-images")
    .upload(filePath, file);

  if (error) throw error;

  const { data } = supabase.storage
    .from("epaper-images")
    .getPublicUrl(filePath);

  return data.publicUrl;
};

/* ================= ADMIN LOGIN (SUPABASE AUTH) ================= */
function AdminLogin() {
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [error, setError] = useState("");

  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: pwd,
    });

    if (error) {
      setError(error.message);
    }
    // No manual state change here — onAuthStateChange listener handles it
  };

  return (
    <div className="admin login">
      <h2>Admin Login</h2>

      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Admin Email"
      />

      <input
        type="password"
        value={pwd}
        onChange={(e) => setPwd(e.target.value)}
        placeholder="Password"
      />

      <button onClick={handleLogin}>Login</button>

      {error && <p className="error">{error}</p>}
    </div>
  );
}

/* ================= ADMIN PANEL ================= */
function AdminPanel({ pages, reloadPages, onClose }) {
  const [newTitle, setNewTitle] = useState("");
  const [selectedPage, setSelectedPage] = useState("");

  // CHANGED: "img" (single string) replaced with "images" (array)
  const [article, setArticle] = useState({ images: [], title: "", text: "" });

  const addLayout = async () => {
    if (!newTitle) return;

    const { error } = await supabase
      .from("layouts")
      .insert([{ title: newTitle }]);

    if (error) {
      alert("Add layout failed: " + error.message);
      return;
    }

    setNewTitle("");
    await reloadPages();
  };

  const deleteLayout = async (id) => {
    if (!window.confirm("Delete this layout?")) return;

    const { error } = await supabase.from("layouts").delete().eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    reloadPages();
  };

  // NEW: rename an existing layout title
  const [editingLayoutId, setEditingLayoutId] = useState(null);
  const [editingTitle, setEditingTitle] = useState("");

  const startEditingLayout = (p) => {
    setEditingLayoutId(p.id);
    setEditingTitle(p.title);
  };

  const cancelEditingLayout = () => {
    setEditingLayoutId(null);
    setEditingTitle("");
  };

  const saveLayoutTitle = async (id) => {
    if (!editingTitle.trim()) return;

    const { error } = await supabase
      .from("layouts")
      .update({ title: editingTitle.trim() })
      .eq("id", id);

    if (error) {
      alert("Rename failed: " + error.message);
      return;
    }

    setEditingLayoutId(null);
    setEditingTitle("");
    await reloadPages();
  };

  const addArticle = async () => {
    if (!selectedPage) {
      alert("Please select a layout first");
      return;
    }

    // CHANGED: require at least one image in the array instead of a single img
    if (!article.title || !article.text || article.images.length === 0) return;

    const { error } = await supabase.from("articles").insert([
      {
        layout_id: Number(selectedPage),
        title: article.title,
        text: article.text,
        images: article.images, // CHANGED: save array instead of single img
      },
    ]);

    if (error) {
      alert(error.message);
      return;
    }

    setArticle({ images: [], title: "", text: "" });
    await reloadPages();
  };

  const deleteArticle = async (id) => {
    const { error } = await supabase.from("articles").delete().eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    reloadPages();
  };

  return (
    <div className="admin">
      <h2>Admin Panel</h2>

      <button
        onClick={async () => {
          await supabase.auth.signOut();
          onClose();
        }}
      >
        Logout
      </button>

      <hr />

      <input
        placeholder="New Layout Title"
        value={newTitle}
        onChange={(e) => setNewTitle(e.target.value)}
      />
      <button onClick={addLayout}>➕ Add Layout</button>

      <hr />

      {pages.map((p) => (
        <div key={p.id} className="delete-row">
          {editingLayoutId === p.id ? (
            <>
              <input
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveLayoutTitle(p.id);
                  if (e.key === "Escape") cancelEditingLayout();
                }}
                autoFocus
              />
              <button onClick={() => saveLayoutTitle(p.id)}>✅ Save</button>
              <button onClick={cancelEditingLayout}>✖ Cancel</button>
            </>
          ) : (
            <>
              <b>{p.title}</b>
              <button onClick={() => startEditingLayout(p)}>✏️ Rename</button>
              <button onClick={() => deleteLayout(p.id)}>🗑</button>
            </>
          )}
        </div>
      ))}

      <hr />

      <select
        value={selectedPage}
        onChange={(e) => setSelectedPage(e.target.value)}
      >
        <option value="">Select layout</option>

        {pages.map((p) => (
          <option key={p.id} value={p.id.toString()}>
            {p.title}
          </option>
        ))}
      </select>

      {/* CHANGED: "multiple" attribute + uploads every selected file */}
      <input
        type="file"
        accept="image/*"
        multiple
        onChange={async (e) => {
          const files = Array.from(e.target.files);
          if (!files.length) return;
          const urls = await Promise.all(files.map((f) => uploadImageToStorage(f)));
          setArticle({ ...article, images: [...article.images, ...urls] });
        }}
      />

      {/* CHANGED: preview every selected image, with a remove button each */}
      {article.images.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0" }}>
          {article.images.map((url, i) => (
            <div key={i} style={{ position: "relative" }}>
              <img src={url} alt="" width={100} />
              <button
                onClick={() =>
                  setArticle({
                    ...article,
                    images: article.images.filter((_, idx) => idx !== i),
                  })
                }
                style={{ position: "absolute", top: 2, right: 2 }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        placeholder="Article Title"
        value={article.title}
        onChange={(e) => setArticle({ ...article, title: e.target.value })}
      />

      <textarea
        placeholder="Article Text"
        value={article.text}
        onChange={(e) => setArticle({ ...article, text: e.target.value })}
      />

      <button onClick={addArticle}>➕ Add Article</button>

      {pages
        .find((p) => p.id === Number(selectedPage))
        ?.articles?.map((a) => (
          <div key={a.id} className="delete-row">
            {a.title}
            <button onClick={() => deleteArticle(a.id)}>🗑</button>
          </div>
        ))}
    </div>
  );
}

/* ================= MAIN APP ================= */
export default function App() {
  const [pages, setPages] = useState([]);
  const [current, setCurrent] = useState(0);
  const [showAdmin, setShowAdmin] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // tracks which article IDs have been expanded via "Read more"
  const [expandedIds, setExpandedIds] = useState(new Set());

  const toggleExpanded = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Masonry distribution: places article 1 → col 0, article 2 → col 1,
  // article 3 → col 2 (every column starts at weight 0, ties go to the
  // next empty column left-to-right), then from article 4 onward adds
  // each one to whichever column is currently lightest — so the first
  // row always reads 1 → 2 → 3 across, and gaps get filled after that.
  const distributeMasonry = (articles) => {
    const columns = [[], [], []];
    const weights = [0, 0, 0];

    articles.forEach((a) => {
      // rough height estimate: longer text + more images = taller card
      const estimatedHeight =
        (a.text?.length || 0) +
        (a.images?.length || (a.img ? 1 : 0)) * 150;

      let lightest = 0;
      for (let i = 1; i < weights.length; i++) {
        if (weights[i] < weights[lightest]) lightest = i;
      }

      columns[lightest].push(a);
      weights[lightest] += estimatedHeight;
    });

    return columns;
  };

  const loadPages = useCallback(async () => {
    const { data, error } = await supabase
      .from("layouts")
      // CHANGED: fetch both "img" (old articles) and "images" (new articles)
      .select(`id, title, articles (id, title, text, img, images, created_at)`)
      .order("id", { ascending: true });

    if (error) {
      console.error(error);
      return;
    }

    const normalized = (data || []).map((p) => ({
      ...p,
      articles: p.articles || [],
    }));

    setPages(normalized);
  }, []);

  useEffect(() => {
    loadPages();
  }, [loadPages]);

  /* ================= SESSION TRACKING (FIXED) =================
     Only track whether a session exists. Do NOT force the admin
     panel open just because a session is present — that was
     exposing /admin to anyone opening the site in a browser
     where an admin had previously logged in. Visibility of the
     admin panel is controlled solely by the secret hash route
     below.
  =============================================================== */
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setIsLoggedIn(!!session);
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (window.location.hash === "#/ANEWS-x9Qm25-SEC-admin") {
      setShowAdmin(true);
    }
  }, []);

  const currentPage = pages[current];

  return (
    <div className="app">
      <header className="header">
        <img src="pages/header.jpg" alt="Header" className="header-photo" />
        <h1 className="title">ANEWS E-PAPER</h1>
      </header>

      <nav className="navbar">
        <button className="nav-link active">Home</button>
        <div className="nav-date">
          {new Date().toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </div>
      </nav>

      <main className="viewer-area">
        {showAdmin && isLoggedIn ? (
          <AdminPanel
            pages={pages}
            reloadPages={loadPages}
            onClose={() => {
              setShowAdmin(false);
              setIsLoggedIn(false);
              window.location.hash = "";
            }}
          />
        ) : showAdmin ? (
          <AdminLogin />
        ) : (
          currentPage && (
            <section className="viewer">
              <div className="page-bar">
                <button
                  onClick={() =>
                    setCurrent((c) => (c - 1 + pages.length) % pages.length)
                  }
                >
                  ◀ Prev
                </button>

                <p>
                  Page {current + 1} / {pages.length}
                </p>

                <button
                  onClick={() => setCurrent((c) => (c + 1) % pages.length)}
                >
                  Next ▶
                </button>
              </div>

              <h2 className="page-heading">{currentPage.title}</h2>

              {(() => {
                const sortedArticles = [...(currentPage.articles || [])].sort(
                  (a, b) => new Date(b.created_at) - new Date(a.created_at)
                );

                const renderCard = (a, isLead) => {
                  const imagesToShow =
                    a.images?.length > 0 ? a.images : a.img ? [a.img] : [];
                  const isExpanded = expandedIds.has(a.id);

                  return (
                    <div
                      key={a.id}
                      className={`col-article${isLead ? " lead" : ""}`}
                    >
                      <div className="imgrow">
                        {imagesToShow.map((url, i) => (
                          <img key={i} src={url} alt={a.title} />
                        ))}
                      </div>
                      <h3>{a.title}</h3>

                      <p className={!isExpanded ? "clamped" : ""}>{a.text}</p>

                      <button
                        className="read-more"
                        onClick={() => toggleExpanded(a.id)}
                      >
                        {isExpanded ? "Show less" : "Read more"}
                      </button>
                    </div>
                  );
                };

                // masonry: articles 1/2/3 fill left→middle→right on the
                // first pass, then gap-fill from article 4 onward.
                const columns = distributeMasonry(sortedArticles);

                return (
                  <div className="columns masonry-mode">
                    {columns.map((col, colIndex) => (
                      <div className="masonry-col" key={colIndex}>
                        {col.map((a) =>
                          renderCard(a, sortedArticles[0]?.id === a.id)
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </section>
          )
        )}
      </main>

      <footer className="footer">
        <p>Thanks for visiting ANEWS E-Paper</p>
      </footer>
    </div>
  );
}