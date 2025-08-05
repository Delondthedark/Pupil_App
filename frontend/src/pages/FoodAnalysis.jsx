import React, { useState, useEffect, useCallback } from 'react';

export default function FoodAnalysis() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [data, setData] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [loadingResults, setLoadingResults] = useState(false);

  const apiBase = process.env.REACT_APP_API_BASE_URL;

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('image', selectedFile);

    try {
      const res = await fetch(`${apiBase}/food/upload`, {
        method: 'POST',
        body: formData,
      });
      const result = await res.json();
      console.log('📤 Enqueue response:', result);

      await fetch(`${apiBase}/queue/enqueue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: result.imageUrl }),
      });

      setSelectedFile(null);
      setPreviewUrl('');
      fetchResults();
    } catch (err) {
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  const fetchResults = useCallback(async () => {
    setLoadingResults(true);
    try {
      const res = await fetch(`${apiBase}/food/results`);
      const items = await res.json();
      setData(items);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoadingResults(false);
    }
  }, [apiBase]);

  useEffect(() => {
    fetchResults();
    const interval = setInterval(fetchResults, 3000);
    return () => clearInterval(interval);
  }, [fetchResults]);

  return (
    <div style={styles.page}>
      <h2 style={styles.title}>🍽️ Food Analysis</h2>

      <div style={styles.uploadSection}>
        <input type="file" accept="image/*" onChange={handleFileChange} style={styles.fileInput} />
        {previewUrl && (
          <div style={styles.previewWrapper}>
            <img src={previewUrl} alt="Preview" style={styles.previewImage} />
            <button onClick={handleUpload} disabled={uploading} style={styles.uploadButton}>
              {uploading ? 'Uploading…' : 'Upload & Analyze'}
            </button>
          </div>
        )}
      </div>

      <h3 style={styles.sectionTitle}>{loadingResults ? 'Fetching results…' : 'Analysis Results'}</h3>
      <div style={styles.grid}>
        {data.map((entry, idx) => (
          <div key={idx} style={styles.card}>
            <img
              src={`data:image/jpeg;base64,${entry.annotatedImage}`}
              alt="Annotated Result"
              style={styles.resultImage}
            />
            <div style={styles.textBlock}>
              <p style={styles.itemName}>
                {Array.isArray(entry.items)
                  ? entry.items.join(', ')
                  : entry.items || 'No items'}
              </p>
              <p style={styles.timestamp}>{new Date(entry.timestamp).toLocaleString()}</p>
            </div>
          </div>
        ))}
        {!loadingResults && data.length === 0 && (
          <p style={styles.empty}>No results yet. Upload an image to begin.</p>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: { padding: '1rem', fontFamily: 'Segoe UI', maxWidth: 480, margin: '0 auto' },
  title: { textAlign: 'center', color: '#1B5A72', fontSize: '1.75rem', marginBottom: '1.5rem' },
  uploadSection: { marginBottom: '2rem', textAlign: 'center' },
  fileInput: { width: '100%', padding: '0.5rem', marginBottom: '1rem' },
  previewWrapper: { position: 'relative' },
  previewImage: { width: '100%', borderRadius: 12, marginBottom: '0.5rem' },
  uploadButton: { padding: '0.75rem 1.25rem', backgroundColor: '#28a745', color: '#fff', border: 'none', borderRadius: 8 },
  sectionTitle: { fontSize: '1.25rem', marginBottom: '1rem', color: '#333' },
  grid: { display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' },
  card: { background: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.1)', overflow: 'hidden' },
  resultImage: { width: '100%', display: 'block' },
  textBlock: { padding: '0.75rem' },
  itemName: { margin: '0 0 0.25rem', fontSize: '1rem', fontWeight: 600 },
  timestamp: { margin: 0, fontSize: '0.875rem', color: '#666' },
  empty: { marginTop: '2rem', textAlign: 'center', color: '#888' },
};
