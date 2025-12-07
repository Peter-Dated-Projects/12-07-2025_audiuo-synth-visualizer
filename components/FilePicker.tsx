export default function FilePicker() {
  return (
    <div>
      <p>File Picker Component</p>
      <div>
        <form>
          <label htmlFor="fileInput">Choose a file:</label>
          <input type="file" />
          <input type="submit" value="Upload" />
        </form>
      </div>
    </div>
  );
}
