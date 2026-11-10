using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using UnityEngine;

namespace QuQu
{
    // A portable preset stores content-addressed assets, never absolute source paths.
    public static class ArenaPresetArchive
    {
        const long Megabyte = 1024 * 1024, MaximumBundle = 512 * Megabyte;
        static readonly Regex AssetName = new Regex(@"^assets/[a-f0-9]{64}\.(glb|png|jpg|jpeg|mp3|ogg|wav)$");
        static string Hash(Stream stream)
        { using (var sha = SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "").ToLowerInvariant(); }
        static void MapAssets(ArenaPreferences profile, Func<string, string[], long, string> map)
        {
            profile.musicPath = map(profile.musicPath, new[] { ".mp3", ".ogg", ".wav" }, 128 * Megabyte);
            profile.backgroundPath = map(profile.backgroundPath, new[] { ".png", ".jpg", ".jpeg" }, 16 * Megabyte);
            foreach (var avatar in profile.avatars)
            {
                avatar.modelPath = map(avatar.modelPath, new[] { ".glb" }, 64 * Megabyte);
                avatar.facePath = map(avatar.facePath, new[] { ".png", ".jpg", ".jpeg" }, 16 * Megabyte);
            }
        }
        public static void Export(ArenaPreferences current, string destination)
        {
            var profile = JsonUtility.FromJson<ArenaPreferences>(JsonUtility.ToJson(current)); profile.Validate();
            profile.endpoint = "http://127.0.0.1:8181";
            string temp = destination + "." + Guid.NewGuid().ToString("N") + ".tmp";
            try
            {
                using (var file = new FileStream(temp, FileMode.CreateNew))
                using (var archive = new ZipArchive(file, ZipArchiveMode.Create))
                {
                    var written = new HashSet<string>(); long total = 0;
                    MapAssets(profile, (source, extensions, maximum) =>
                    {
                        if (string.IsNullOrEmpty(source)) return "";
                        string ext = Path.GetExtension(source).ToLowerInvariant();
                        if (!extensions.Contains(ext) || !File.Exists(source)) throw new InvalidDataException("素材缺失或格式不支持：" + Path.GetFileName(source));
                        using (var input = File.OpenRead(source))
                        {
                            if (input.Length > maximum) throw new InvalidDataException("素材超过大小限制");
                            string name = "assets/" + Hash(input) + ext; input.Position = 0;
                            if (written.Add(name))
                            {
                                total += input.Length; if (total > MaximumBundle) throw new InvalidDataException("素材包超过 512 MB");
                                using (var output = archive.CreateEntry(name, System.IO.Compression.CompressionLevel.Fastest).Open()) input.CopyTo(output);
                            }
                            return name;
                        }
                    });
                    using (var writer = new StreamWriter(archive.CreateEntry("profile.json").Open())) writer.Write(JsonUtility.ToJson(profile, true));
                }
                File.Move(temp, destination);
            }
            finally { if (File.Exists(temp)) File.Delete(temp); }
        }
        public static ArenaPreferences Import(string source, string destinationRoot)
        {
            if (new FileInfo(source).Length > MaximumBundle) throw new InvalidDataException("素材包超过 512 MB");
            Directory.CreateDirectory(destinationRoot);
            string folder = Path.Combine(Path.GetFullPath(destinationRoot), "bundle-" + Guid.NewGuid().ToString("N"));
            string staging = folder + ".staging";
            Directory.CreateDirectory(staging);
            try
            {
                ArenaPreferences profile;
                using (var archive = ZipFile.OpenRead(source))
                {
                    if (archive.Entries.Count > 260 || archive.Entries.Select(e => e.FullName).Distinct().Count() != archive.Entries.Count)
                        throw new InvalidDataException("素材包条目重复或过多");
                    foreach (var entry in archive.Entries)
                        if (entry.FullName != "profile.json" && !AssetName.IsMatch(entry.FullName)) throw new InvalidDataException("素材包包含无效路径");
                    var manifest = archive.GetEntry("profile.json");
                    if (manifest == null || manifest.Length > Megabyte) throw new InvalidDataException("素材包没有有效预设");
                    using (var stream = manifest.Open()) using (var memory = new MemoryStream())
                    {
                        CopyLimited(stream, memory, Megabyte);
                        profile = JsonUtility.FromJson<ArenaPreferences>(System.Text.Encoding.UTF8.GetString(memory.ToArray()));
                    }
                    if (profile == null) throw new InvalidDataException("预设内容无效"); profile.Validate();
                    var copied = new HashSet<string>(); long total = 0;
                    MapAssets(profile, (name, extensions, maximum) =>
                    {
                        if (string.IsNullOrEmpty(name)) return "";
                        if (!AssetName.IsMatch(name) || !extensions.Contains(Path.GetExtension(name))) throw new InvalidDataException("预设素材路径无效");
                        var entry = archive.GetEntry(name);
                        if (entry == null || entry.Length > maximum) throw new InvalidDataException("素材缺失或超出大小限制");
                        string filename = Path.GetFileName(name);
                        if (copied.Add(name))
                        {
                            total += entry.Length; if (total > MaximumBundle) throw new InvalidDataException("素材解压后超过 512 MB");
                            string local = Path.Combine(staging, filename);
                            using (var input = entry.Open()) using (var output = new FileStream(local, FileMode.CreateNew)) CopyLimited(input, output, maximum);
                            using (var check = File.OpenRead(local)) if (Hash(check) != Path.GetFileNameWithoutExtension(filename)) throw new InvalidDataException("素材校验失败，文件可能已损坏");
                        }
                        return Path.Combine(folder, filename);
                    });
                }
                Directory.Move(staging, folder); return profile;
            }
            finally { if (Directory.Exists(staging)) Directory.Delete(staging, true); }
        }
        static void CopyLimited(Stream input, Stream output, long maximum)
        {
            byte[] buffer = new byte[81920]; long total = 0; int count;
            while ((count = input.Read(buffer, 0, buffer.Length)) > 0)
            { total += count; if (total > maximum) throw new InvalidDataException("素材解压大小超过限制"); output.Write(buffer, 0, count); }
        }
    }
}
