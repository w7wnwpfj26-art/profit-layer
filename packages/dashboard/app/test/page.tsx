export default function TestPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">✅ Dashboard 正常运行</h1>
      <p className="mt-4">钱包页面应该可以访问了</p>
      <p className="mt-2">请访问: <a href="/wallet" className="text-blue-500 underline">/wallet</a></p>
    </div>
  );
}
