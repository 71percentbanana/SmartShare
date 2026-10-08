import React, { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { formatBytes } from '../lib/format';

interface FileUploaderProps {
  onFileSelected: (file: File) => void;
  selectedFile: File | null;
  chunkSize?: number;
}

export const FileUploader: React.FC<FileUploaderProps> = ({
  onFileSelected,
  selectedFile,
  chunkSize = 65536,
}) => {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const testPayload = (mb: number) => {
    const bytes = new Uint8Array(Math.floor(mb * 1024 * 1024));
    // patterned data so every chunk gets a different checksum
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + (i >> 10)) & 0xff;
    onFileSelected(new File([bytes], `test-payload-${mb}mb.bin`, { type: 'application/octet-stream' }));
  };

  const chunks = selectedFile ? Math.max(1, Math.ceil(selectedFile.size / chunkSize)) : 0;

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        hidden
        onChange={(e) => e.target.files?.[0] && onFileSelected(e.target.files[0])}
      />
      <button
        type="button"
        className="drop"
        data-drag={dragging}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files[0]) onFileSelected(e.dataTransfer.files[0]);
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Upload size={18} />
          <span style={{ fontWeight: 500 }}>Choose a file, or drop one here</span>
        </span>
        <span className="small faint" style={{ display: 'block', marginTop: 4 }}>
          Any file type. It is cut into {chunkSize / 1024} KB chunks and each chunk is checked with CRC32.
        </span>
      </button>

      {selectedFile && (
        <div className="file-row">
          <div>
            <div style={{ fontWeight: 500, wordBreak: 'break-all' }}>{selectedFile.name}</div>
            <div className="small muted">{formatBytes(selectedFile.size)}</div>
          </div>
          <div className="mono small">{chunks} chunks</div>
        </div>
      )}

      <div className="chips">
        <span className="xs faint">No file handy? Generate one:</span>
        {[2, 5, 10].map((mb) => (
          <button key={mb} type="button" className="btn btn--sm" onClick={() => testPayload(mb)}>
            {mb} MB
          </button>
        ))}
      </div>
    </div>
  );
};
