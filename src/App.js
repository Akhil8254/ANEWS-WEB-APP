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

  const [article, setArticle] = useState({ images: [], title: "", text: "" });
  const [uploading, setUploading] = useState(false);

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

  const addArticle = async () => {
    if (!selectedPage) {
      alert("Please select a layout first");
      return;
    }

    if (!article.title || !article.text || article.images.length === 0) return;

    // "img" kept in sync with the first image for backward compatibility
    // with any code/rows that still only read the single-image column.
    const { error } = await supabase.from("articles").insert([
      {
        layout_id: Number(selectedPage),
        title: article.title,
        text: article.text,
        img: article.images[0],
        images: article.images,
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

  const handleImageFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploading(true);
    try {
      const urls = await Promise.all(files.map(uploadImageToStorage));
      setArticle((prev) => ({ ...prev, images: [...prev.images, ...urls] }));
    } catch (err) {
      alert("Image upload failed: " + err.message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const removeImage = (index) => {
    setArticle((prev) => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index),
    }));
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
          <b>{p.title}</b>
          <button onClick={() => deleteLayout(p.id)}>🗑</button>
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

      <input
        type="file"
        accept="image/*"
        multiple
        onChange={handleImageFiles}
      />
      {uploading && <p>Uploading…</p>}

      {article.images.length > 0 && (
        <div className="image-preview-row">
          {article.images.map((url, i) => (
            <div key={url + i} className="image-preview-item">
              <img src={url} alt="" width={90} />
              <button type="button" onClick={() => removeImage(i)}>
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

/* ================= HELPERS ================= */
// Old rows only ever had a single "img" column. Newer rows may have
// an "images" array. This keeps both kinds of articles rendering.
const getImagesToShow = (article) => {
  if (Array.isArray(article.images) && article.images.length > 0) {
    return article.images;
  }
  return article.img ? [article.img] : [];
};

/* ================= NEWSPAPER COLUMNS VIEW ================= */
function NewspaperColumns({ articles }) {
  const sorted = [...articles].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  );

  if (sorted.length === 0) return null;

  return (
    <div className="newspaper">
      <div className="columns">
        {sorted.map((a) => {
          const imagesToShow = getImagesToShow(a);
          return (
            <div key={a.id} className="col-article">
              {imagesToShow.length > 0 && (
                <div
                  className="col-article-images"
                  style={{ "--img-count": imagesToShow.length }}
                >
                  {imagesToShow.map((url, i) => (
                    <img key={url + i} src={url} alt={a.title} />
                  ))}
                </div>
              )}
              <h3>{a.title}</h3>
              <p>{a.text}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================= MAIN APP ================= */
export default function App() {
  const [pages, setPages] = useState([]);
  const [current, setCurrent] = useState(0);
  const [showAdmin, setShowAdmin] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const loadPages = useCallback(async () => {
    const { data, error } = await supabase
      .from("layouts")
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

              <NewspaperColumns articles={currentPage.articles || []} />
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