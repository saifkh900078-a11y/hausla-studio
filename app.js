async function processVideo(videoFile, musicFile) {
    // 1. Files ko FFmpeg FS mein likhein
    ffmpeg.FS('writeFile', 'input.mp4', await fetchFile(videoFile));
    ffmpeg.FS('writeFile', 'music.mp3', await fetchFile(musicFile));

    // 2. FFmpeg command run karein (Text aur Music ke saath)
    await ffmpeg.run(
        '-i', 'input.mp4', 
        '-i', 'music.mp3', 
        '-vf', "drawtext=text='Hausla Pakistan':x=(w-text_w)/2:y=h-th-50:fontsize=48:fontcolor=white", 
        '-c:v', 'libx264', 
        '-c:a', 'aac', 
        '-shortest', 
        'output.mp4'
    );

    // 3. Processed video ko FS se read karein
    const data = ffmpeg.FS('readFile', 'output.mp4');
    
    // 4. Blob banayein aur preview mein dikhayein
    const videoBlob = new Blob([data.buffer], { type: 'video/mp4' });
    const videoUrl = URL.createObjectURL(videoBlob);
    
    document.getElementById('previewVideo').src = videoUrl;
    document.getElementById('downloadBtn').href = videoUrl;
}
